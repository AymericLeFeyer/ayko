import { randomUUID } from 'node:crypto';
import type { AgentEvent, ModelParams, StepKind, StepStatus } from '@ayko/contracts';
import type { ConversationRepository } from '../../domain/conversation/repositories/ConversationRepository.js';
import { isActionRequest } from '../../domain/cache/services/normalizeText.js';
import { fitHistory } from '../../domain/conversation/services/contextWindow.js';
import { withToolHistory } from '../../domain/conversation/services/toolHistory.js';
import { parseMemoryCommand } from '../../domain/memory/services/memoryRules.js';
import type { CacheEntryRecord } from '../../domain/cache/repositories/CacheRepository.js';
import type { LlmMessage, LlmTool, LlmToolCall } from '../../domain/llm/LlmProvider.js';
import {
  mayBeStructuredCall,
  parseStructuredCall,
  structuredToolPrompt,
} from '../../domain/llm/services/structuredTools.js';
import type { McpToolRecord } from '../../domain/mcp/repositories/McpRepository.js';
import { blocksFromResult } from '../../domain/mcp/services/toolBlocks.js';
import { renderPrompt } from '../../domain/persona/services/renderPrompt.js';
import type { Logger } from '../../domain/system/Logger.js';
import { isAbortError, Semaphore } from '../../shared/async.js';
import { AppError, errorMessage } from '../../shared/errors.js';
import type { CacheMatch, CacheService, ExecutedCall } from '../cache/CacheService.js';
import type { MemoryService } from '../memory/MemoryService.js';
import type { HomeContextService } from './HomeContextService.js';
import type { OllamaService } from '../llm/OllamaService.js';
import type { ExposedTool, McpRegistry } from '../mcp/McpRegistry.js';
import type { PersonaService } from '../persona/PersonaService.js';
import type { RoomService } from '../rooms/RoomService.js';
import type { SettingsService } from '../system/SettingsService.js';
import type { EventBus } from '../system/EventBus.js';

export type Emit = (event: AgentEvent) => void;

export interface AgentInput {
  text: string;
  roomId?: string | null;
  deviceId?: string | null;
  conversationId?: string | null;
  model?: string | null;
  personaId?: string | null;
  bypassCache?: boolean;
  source: 'playground' | 'display' | 'api';
}

const DEFAULT_NUM_CTX = 4096;
const ACTION_CLAUSE =
  "Pour agir sur la maison, tu dois appeler l'outil correspondant. Lire l'état d'un appareil " +
  "ne le change pas. N'annonce jamais qu'une action est faite sans le résultat de son outil.";
const ACTION_REMINDER =
  "[Rappel] Tu n'as appelé aucun outil d'action, donc rien n'a été fait. Appelle maintenant " +
  "l'outil qui exécute la demande, ou explique pourquoi c'est impossible.";
const ACTION_NOT_DONE =
  "Je n'ai pas réussi à exécuter cette action, rien n'a été fait. Vérifie le nom de l'appareil.";
const ROUTING_PROMPT =
  "Détermine si la demande suivante nécessite d'agir sur la maison ou de consulter une " +
  'information externe. Réponds par un seul mot : OUTILS ou DIRECT.';

/** Everything one request accumulates while it runs. */
interface Run {
  requestId: string;
  conversationId: string;
  roomId: string | null;
  deviceId: string | null;
  input: AgentInput;
  emit: Emit;
  signal: AbortSignal;
  startedAt: number;
  calls: ExecutedCall[];
  anyToolFailed: boolean;
  /** A tool able to change something was tried, whatever came of it. */
  actionAttempted: boolean;
  ttftMs: number | null;
  outputTokens: number;
  evalDurationMs: number;
  model: string | null;
  reasoning: string;
}

class ReplayFailure extends Error {}

/** Shown to the family on tablets, so the admin's wording wins over the technical name. */
const toolLabel = (tool: McpToolRecord) => tool.customDescription ?? tool.description ?? tool.name;

export class AgentService {
  private readonly active = new Map<string, { controller: AbortController }>();
  private readonly confirmations = new Map<
    string,
    { requestId: string; resolve: (accepted: boolean) => void }
  >();
  private readonly queue = new Semaphore(1);

  constructor(
    private readonly conversations: ConversationRepository,
    private readonly ollama: OllamaService,
    private readonly registry: McpRegistry,
    private readonly personas: PersonaService,
    private readonly rooms: RoomService,
    private readonly cache: CacheService,
    private readonly memory: MemoryService,
    private readonly homeContext: HomeContextService,
    private readonly settings: SettingsService,
    private readonly bus: EventBus,
    private readonly logger: Logger,
  ) {}

  get queueDepth() {
    return this.queue.waiting;
  }

  cancel(requestId: string) {
    const entry = this.active.get(requestId);
    entry?.controller.abort();
    return Boolean(entry);
  }

  answerConfirmation(confirmId: string, accepted: boolean) {
    const pending = this.confirmations.get(confirmId);
    pending?.resolve(accepted);
    return Boolean(pending);
  }

  /** Runs one request to completion, emitting its events; never rejects. */
  async run(input: AgentInput, emit: Emit): Promise<string> {
    const requestId = randomUUID();
    const now = new Date().toISOString();
    const roomId = input.roomId ?? null;
    const conversationId = await this.ensureConversation(input, roomId, now);
    const controller = new AbortController();
    const agent = (await this.settings.get()).agent;
    const timer = setTimeout(
      () => controller.abort(new AppError('timeout', 'Délai total dépassé', 504)),
      agent.totalTimeoutMs,
    );
    this.active.set(requestId, { controller });
    this.queue.limit = agent.maxConcurrentRequests;

    await this.conversations.createRequest({
      id: requestId,
      conversationId,
      roomId,
      deviceId: input.deviceId ?? null,
      text: input.text,
      status: 'running',
      createdAt: now,
    });
    await this.conversations.addMessage({
      id: randomUUID(),
      conversationId,
      requestId,
      role: 'user',
      content: input.text,
      createdAt: now,
    });

    const run: Run = {
      requestId,
      conversationId,
      roomId,
      deviceId: input.deviceId ?? null,
      input,
      emit,
      signal: controller.signal,
      startedAt: performance.now(),
      calls: [],
      anyToolFailed: false,
      actionAttempted: false,
      ttftMs: null,
      outputTokens: 0,
      evalDurationMs: 0,
      model: null,
      reasoning: '',
    };
    emit({ type: 'request.accepted', requestId, conversationId });
    emit({ type: 'state.changed', requestId, state: 'thinking' });
    this.bus.publish({ topic: 'request.changed', requestId });
    const { name: roomName } = await this.rooms.describeRoom(roomId);
    const announce = (status: 'running' | 'done' | 'error' | 'cancelled') =>
      this.bus.publish({
        topic: 'house.activity',
        requestId,
        roomName,
        text: input.text,
        status,
      });
    announce('running');

    try {
      const outcome = await this.execute(run);
      await this.finish(run, outcome.answer, outcome.cacheHit);
      announce('done');
    } catch (error) {
      await this.fail(run, error);
      const cancelled = run.signal.aborted && !(run.signal.reason instanceof AppError);
      announce(cancelled ? 'cancelled' : 'error');
    } finally {
      clearTimeout(timer);
      this.active.delete(requestId);
      for (const [id, pending] of this.confirmations) {
        if (pending.requestId === requestId) this.confirmations.delete(id);
      }
      this.bus.publish({ topic: 'request.changed', requestId });
    }
    return requestId;
  }

  private async ensureConversation(input: AgentInput, roomId: string | null, now: string) {
    if (input.source === 'display' && roomId) {
      const { agent } = await this.settings.get();
      const since = new Date(Date.parse(now) - agent.sessionMinutes * 60_000).toISOString();
      const recent = await this.conversations.findRecentConversation(roomId, 'display', since);
      if (recent) return recent;
    }
    if (input.conversationId) {
      const existing = await this.conversations.findConversation(input.conversationId);
      if (existing) return existing.id;
    }
    const id = randomUUID();
    await this.conversations.createConversation({
      id,
      roomId,
      title: input.text.slice(0, 80),
      source: input.source,
      createdAt: now,
    });
    return id;
  }

  /** "Souviens-toi que…" never reaches the model, so nothing can be invented or lost. */
  private async runMemoryCommand(run: Run) {
    const { agent } = await this.settings.get();
    const command = agent.memoryEnabled ? parseMemoryCommand(run.input.text) : null;
    if (!command) return null;
    let answer = "C'est noté, je m'en souviendrai.";
    if (command.type === 'remember') {
      await this.memory.remember(command.fact);
    } else {
      const forgotten = await this.memory.forget(command.query);
      answer = forgotten ? `C'est oublié : ${forgotten}.` : 'Je ne trouve rien de tel en mémoire.';
    }
    run.emit({ type: 'state.changed', requestId: run.requestId, state: 'answering' });
    run.emit({ type: 'answer.delta', requestId: run.requestId, text: answer });
    return answer;
  }

  private async execute(run: Run): Promise<{ answer: string; cacheHit: boolean }> {
    const remembered = await this.runMemoryCommand(run);
    if (remembered) return { answer: remembered, cacheHit: false };
    const useCache = !run.input.bypassCache && (await this.cache.isEnabledFor(run.roomId));
    if (useCache) {
      const started = performance.now();
      const match = await this.cache.lookup(run.input.text, run.roomId, run.signal);
      const durationMs = performance.now() - started;
      await this.conversations.updateRequest(run.requestId, {
        cacheOutcome: match ? 'hit' : 'miss',
        cacheEntryId: match?.entry.id ?? null,
        cacheMatchType: match?.matchType ?? null,
        cacheDurationMs: durationMs,
      });
      if (match) {
        const replayed = await this.replay(run, match);
        if (replayed !== null) return { answer: replayed, cacheHit: true };
        await this.conversations.updateRequest(run.requestId, { cacheOutcome: 'miss' });
      } else {
        const step = await this.startStep(run, 'cache_miss', 'Aucun raccourci mémorisé');
        await step.finish('done');
      }
    }

    const agent = (await this.settings.get()).agent;
    this.queue.limit = agent.maxConcurrentRequests;
    const wait = this.queue.busy
      ? await this.startStep(run, 'queue', 'En attente de disponibilité du modèle')
      : null;
    const release = await this.queue.acquire(run.signal);
    await wait?.finish('done');
    try {
      return { answer: await this.llmLoop(run), cacheHit: false };
    } finally {
      release();
    }
  }

  private async startStep(run: Run, kind: StepKind, label: string, detail: unknown = null) {
    const stepId = randomUUID();
    const started = performance.now();
    await this.conversations.addStep({
      id: stepId,
      requestId: run.requestId,
      kind,
      label,
      status: 'running',
      detail,
      startedAt: new Date().toISOString(),
      durationMs: null,
    });
    run.emit({
      type: 'activity.step',
      requestId: run.requestId,
      stepId,
      kind,
      label,
      status: 'running',
    });
    return {
      finish: async (status: StepStatus, finalDetail?: unknown) => {
        const durationMs = performance.now() - started;
        await this.conversations.finishStep(stepId, {
          status,
          durationMs,
          ...(finalDetail === undefined ? {} : { detail: finalDetail }),
        });
        run.emit({
          type: 'activity.step',
          requestId: run.requestId,
          stepId,
          kind,
          label,
          status,
          durationMs,
        });
      },
    };
  }

  private async askConfirmation(run: Run, label: string) {
    const { agent } = await this.settings.get();
    const confirmId = randomUUID();
    const step = await this.startStep(run, 'confirm', label);
    const expiresAt = new Date(Date.now() + agent.confirmTimeoutSeconds * 1000).toISOString();
    run.emit({ type: 'confirm.request', requestId: run.requestId, confirmId, label, expiresAt });
    const accepted = await new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => settle(false), agent.confirmTimeoutSeconds * 1000);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const settle = (value: boolean) => {
        clearTimeout(timer);
        run.signal.removeEventListener('abort', onAbort);
        this.confirmations.delete(confirmId);
        resolve(value);
      };
      run.signal.addEventListener('abort', onAbort, { once: true });
      this.confirmations.set(confirmId, { requestId: run.requestId, resolve: settle });
    });
    await step.finish('done', { accepted });
    return accepted;
  }

  /**
   * Single gate of every tool execution, LLM-driven or replayed. The policy is
   * re-resolved here, so nothing the model outputs can reach a forbidden tool.
   */
  private async executeTool(
    run: Run,
    tool: McpToolRecord,
    args: Record<string, unknown>,
    source: 'llm' | 'cache',
  ): Promise<{ text: string; isError: boolean; declined: boolean }> {
    if (!tool.readOnly) {
      run.actionAttempted = true;
      this.homeContext.invalidate();
    }
    const policy = this.registry.policyFor(tool, run.roomId);
    if (policy === 'forbidden') {
      run.anyToolFailed = true;
      return {
        text: 'Outil interdit par la politique de la maison.',
        isError: true,
        declined: false,
      };
    }
    if (policy === 'confirm') {
      const accepted = await this.askConfirmation(run, `Autoriser : ${toolLabel(tool)} ?`);
      if (!accepted) {
        run.anyToolFailed = true;
        return { text: "L'utilisateur a refusé cette action.", isError: true, declined: true };
      }
    }
    const { agent } = await this.settings.get();
    const step = await this.startStep(run, 'tool_call', toolLabel(tool), {
      arguments: args,
    });
    const result = await this.registry.call(tool, args, {
      requestId: run.requestId,
      roomId: run.roomId,
      source,
      timeoutMs: agent.toolTimeoutMs,
      signal: run.signal,
    });
    await step.finish(result.isError ? 'error' : 'done', {
      arguments: args,
      result: result.text.slice(0, agent.toolResultMaxChars),
    });
    const blocks = result.isError ? [] : blocksFromResult(result.raw);
    if (blocks.length > 0) run.emit({ type: 'answer.blocks', requestId: run.requestId, blocks });
    if (result.isError) run.anyToolFailed = true;
    else run.calls.push({ tool, arguments: args, result: result.text });
    return { text: result.text, isError: result.isError, declined: false };
  }

  /** Returns the answer, or null when the caller must fall back on the LLM. */
  private async replay(run: Run, { entry, matchType }: CacheMatch): Promise<string | null> {
    const step = await this.startStep(run, 'cache_hit', 'Raccourci mémorisé', {
      entryId: entry.id,
      matchType,
    });
    try {
      const answer = await this.replayCalls(run, entry);
      await step.finish('done');
      return answer;
    } catch (error) {
      if (!(error instanceof ReplayFailure)) throw error;
      await step.finish('error', { entryId: entry.id, reason: error.message });
      await this.cache.recordFailure(entry, error.message);
      run.calls = [];
      run.anyToolFailed = false;
      return null;
    }
  }

  private async replayCalls(run: Run, entry: CacheEntryRecord) {
    const tools: McpToolRecord[] = [];
    for (const call of entry.calls) {
      const tool = await this.registry.getTool(call.toolId);
      if (!tool) throw new ReplayFailure(`Outil absent : ${call.toolName}`);
      if (!tool.cacheEnabled) throw new ReplayFailure(`Cache désactivé pour ${tool.name}`);
      if (!this.registry.isConnected(tool.serverId)) {
        throw new ReplayFailure(`Serveur non connecté : ${tool.serverName}`);
      }
      tools.push(tool);
    }

    if (entry.kind === 'read') {
      const ttl = entry.ttlSeconds ?? tools[0]?.cacheTtlSeconds ?? null;
      const age = entry.lastResultAt
        ? (Date.now() - new Date(entry.lastResultAt).getTime()) / 1000
        : Infinity;
      if (ttl !== null && entry.lastResult !== null && age < ttl) {
        await this.cache.recordHit(entry);
        return entry.lastResult;
      }
    }

    const results: string[] = [];
    for (const [index, call] of entry.calls.entries()) {
      const tool = tools[index] as McpToolRecord;
      const result = await this.executeTool(run, tool, call.arguments, 'cache');
      // A declined confirmation says nothing about the entry's health: stop quietly.
      if (result.declined) return 'Action annulée.';
      if (result.isError) throw new ReplayFailure(result.text);
      results.push(result.text);
    }
    const answer = entry.kind === 'read' ? results.join('\n') : entry.response;
    await this.cache.recordHit(entry, entry.kind === 'read' ? answer : undefined);
    return answer;
  }

  private async resolveModel(run: Run) {
    const role = await this.ollama.getRole('conversation');
    const model = run.input.model ?? role?.model;
    if (!model) {
      throw new AppError('no_model', 'Aucun modèle de conversation configuré', 409);
    }
    return { model, params: (role?.params ?? {}) as Partial<ModelParams> };
  }

  private async routeNeedsTools(run: Run) {
    const { agent } = await this.settings.get();
    const role = await this.ollama.getRole('routing');
    if (!agent.routingEnabled || !role?.model) return true;
    const step = await this.startStep(run, 'routing', 'Analyse de la demande');
    let output = '';
    try {
      for await (const chunk of this.ollama.chat(
        {
          model: role.model,
          params: role.params,
          messages: [
            { role: 'system', content: role.params.systemPrompt ?? ROUTING_PROMPT },
            { role: 'user', content: run.input.text },
          ],
        },
        run.signal,
      )) {
        if (chunk.type === 'text') output += chunk.text;
      }
      const direct = /direct/i.test(output) && !/outils/i.test(output);
      await step.finish('done', { output });
      return !direct;
    } catch (error) {
      if (isAbortError(error) || run.signal.aborted) throw error;
      // A broken router must not block the request: assume tools are needed.
      await step.finish('error', { error: errorMessage(error) });
      return true;
    }
  }

  private async llmLoop(run: Run): Promise<string> {
    const { agent } = await this.settings.get();
    const { model, params } = await this.resolveModel(run);
    run.model = model;
    await this.conversations.updateRequest(run.requestId, { model });

    const room = await this.rooms.describeRoom(run.roomId);
    const persona = await this.personas.resolve(
      run.input.personaId ?? null,
      room.config?.personaId ?? null,
    );
    const context = await this.personas.buildContext(run.roomId);
    const rendered = renderPrompt(persona, context);
    const contextBlock = [
      `Date et heure : ${rendered.variables.date}, ${rendered.variables.time}`,
      `Pièce d'origine : ${rendered.variables.room}`,
      `Appareils de la pièce : ${rendered.variables.devices}`,
    ].join('\n');

    const exposed = (await this.routeNeedsTools(run))
      ? await this.registry.toolsFor(run.roomId)
      : [];
    const tools: LlmTool[] = exposed.map((item) => ({
      name: item.exposedName,
      description: item.description,
      parameters: item.tool.inputSchema,
    }));
    const native =
      tools.length > 0 ? await this.ollama.supportsTools(model).catch(() => true) : true;

    const canAct = exposed.some((item) => !item.tool.readOnly);
    const home = await this.homeContext.forPrompt(
      exposed.map((item) => item.tool),
      run.roomId,
      room.name,
      agent.homeContextMaxChars,
      run.signal,
    );
    const memories = await this.memory.recall(run.input.text, run.roomId, run.signal);
    const systemPrompt = [
      params.systemPrompt,
      rendered.prompt,
      contextBlock,
      home,
      memories.length > 0
        ? `Ce que tu sais sur cette maison :\n${memories.map((item) => `- ${item}`).join('\n')}`
        : null,
      canAct ? ACTION_CLAUSE : null,
      native ? null : structuredToolPrompt(tools),
    ]
      .filter(Boolean)
      .join('\n\n');

    const previous = await this.conversations.recentMessages(
      run.conversationId,
      agent.historyMessages + 1,
    );
    const past = previous.filter((message) => message.requestId !== run.requestId);
    const requestIds = [...new Set(past.flatMap((message) => message.requestId ?? []))];
    // A model without native tools has no message format for these results.
    const pastCalls = native ? await this.conversations.toolCallsOf(requestIds) : [];
    const exposedName = (toolName: string) =>
      exposed.find((item) => item.tool.name === toolName)?.exposedName ?? toolName;
    const history = withToolHistory(past, pastCalls, exposedName);
    const fitted = fitHistory(
      history,
      systemPrompt,
      run.input.text,
      params.numCtx ?? DEFAULT_NUM_CTX,
    );
    // The window may cut between a call and its result, which models refuse.
    const firstUser = fitted.findIndex((message) => message.role === 'user');
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(firstUser >= 0 ? fitted.slice(firstUser) : []),
      { role: 'user', content: run.input.text },
    ];
    await this.conversations.updateRequest(run.requestId, {
      personaName: persona.name,
      prompt: { messages, tools },
    });

    // Models happily claim "c'est fait" after a mere read. While an action is owed, their
    // text stays off screen, so a false success can be caught before anyone sees it.
    const actionOwed = canAct && isActionRequest(run.input.text);
    let reminded = false;

    for (let iteration = 0; iteration < agent.maxIterations; iteration += 1) {
      const holdText = actionOwed && !run.actionAttempted;
      const step = await this.startStep(run, 'thinking', 'Réflexion');
      const { text, toolCalls } = await this.streamTurn(run, {
        model,
        params,
        messages,
        tools: native ? tools : [],
        structuredTools: native ? null : tools,
        holdText,
      });
      await step.finish('done', { iteration, toolCalls });
      if (toolCalls.length === 0) {
        if (!holdText) return text;
        if (!reminded) {
          reminded = true;
          messages.push({ role: 'assistant', content: text });
          messages.push({ role: 'user', content: ACTION_REMINDER });
          continue;
        }
        const failed = await this.startStep(run, 'error', 'Aucune action exécutée', { text });
        await failed.finish('error');
        run.emit({ type: 'answer.delta', requestId: run.requestId, text: ACTION_NOT_DONE });
        return ACTION_NOT_DONE;
      }
      messages.push({
        role: 'assistant',
        content: text,
        toolCalls: native ? toolCalls : undefined,
      });
      const results = await Promise.all(
        toolCalls.map((call) => this.runToolCall(run, call, exposed, agent.toolResultMaxChars)),
      );
      messages.push(
        ...results.map((result, index): LlmMessage => {
          const name = toolCalls[index]?.name ?? 'outil';
          return native
            ? { role: 'tool', content: result, toolName: name }
            : { role: 'user', content: `Résultat de l'outil ${name} :\n${result}` };
        }),
      );
    }
    throw new AppError('max_iterations', "Nombre maximal d'itérations atteint", 508);
  }

  private async runToolCall(
    run: Run,
    call: LlmToolCall,
    exposed: ExposedTool[],
    maxChars: number,
  ): Promise<string> {
    const match = exposed.find((item) => item.exposedName === call.name);
    if (!match) {
      run.anyToolFailed = true;
      return `Outil inconnu : ${call.name}`;
    }
    const result = await this.executeTool(run, match.tool, call.arguments, 'llm');
    return result.text.slice(0, maxChars);
  }

  private async streamTurn(
    run: Run,
    request: {
      model: string;
      params: Partial<ModelParams>;
      messages: LlmMessage[];
      tools: LlmTool[];
      structuredTools: LlmTool[] | null;
      holdText: boolean;
    },
  ) {
    const started = performance.now();
    let text = '';
    let flushed = 0;
    const toolCalls: LlmToolCall[] = [];
    const flush = (upTo: number) => {
      if (upTo <= flushed) return;
      run.emit({ type: 'answer.delta', requestId: run.requestId, text: text.slice(flushed, upTo) });
      flushed = upTo;
    };
    for await (const chunk of this.ollama.chat(
      {
        model: request.model,
        messages: request.messages,
        params: request.params,
        tools: request.tools,
      },
      run.signal,
    )) {
      if (chunk.type === 'text') {
        if (run.ttftMs === null) {
          run.ttftMs = performance.now() - started;
          run.emit({ type: 'state.changed', requestId: run.requestId, state: 'answering' });
        }
        text += chunk.text;
        // Hold a possible JSON tool call back: it must never reach the screen.
        const mayBeCall = request.structuredTools && flushed === 0 && mayBeStructuredCall(text);
        if (!mayBeCall && !request.holdText) flush(text.length);
      } else if (chunk.type === 'thinking') {
        run.reasoning += chunk.text;
      } else if (chunk.type === 'tool_call') {
        toolCalls.push(chunk.call);
      } else {
        run.outputTokens += chunk.outputTokens ?? 0;
        run.evalDurationMs += chunk.evalDurationMs ?? 0;
      }
    }
    if (request.structuredTools) {
      const call = flushed === 0 ? parseStructuredCall(text, request.structuredTools) : null;
      if (call) toolCalls.push(call);
      else if (!request.holdText) flush(text.length);
    }
    return { text, toolCalls };
  }

  private async finish(run: Run, answer: string, cacheHit: boolean) {
    const durationMs = performance.now() - run.startedAt;
    if (cacheHit) {
      run.emit({ type: 'state.changed', requestId: run.requestId, state: 'answering' });
      run.emit({ type: 'answer.delta', requestId: run.requestId, text: answer });
    }
    const tokensPerSecond =
      run.evalDurationMs > 0 && run.outputTokens > 0
        ? (run.outputTokens * 1000) / run.evalDurationMs
        : null;
    await this.conversations.addMessage({
      id: randomUUID(),
      conversationId: run.conversationId,
      requestId: run.requestId,
      role: 'assistant',
      content: answer,
      createdAt: new Date().toISOString(),
    });
    await this.conversations.updateRequest(run.requestId, {
      status: 'done',
      answer,
      reasoning: run.reasoning || null,
      ttftMs: run.ttftMs,
      tokensPerSecond,
      outputTokens: run.outputTokens || null,
      durationMs,
    });
    if (run.calls.length > 0) {
      const historyKey = await this.cache.recordHistory({
        text: run.input.text,
        roomId: run.roomId,
        deviceId: run.deviceId,
        calls: run.calls,
        durationMs,
      });
      if (!cacheHit && !run.anyToolFailed) {
        await this.learnAliases(run);
        await this.cache.learn({
          text: run.input.text,
          roomId: run.roomId,
          calls: run.calls,
          response: answer,
          durationMs,
          historyKey,
        });
      }
    }
    run.emit({
      type: 'answer.done',
      requestId: run.requestId,
      stats: {
        durationMs,
        ttftMs: run.ttftMs,
        tokensPerSecond,
        outputTokens: run.outputTokens || null,
        model: run.model,
        cacheHit,
      },
    });
    run.emit({ type: 'state.changed', requestId: run.requestId, state: 'idle' });
    this.logger.log('info', 'agent', `Requête terminée en ${Math.round(durationMs)} ms`, {
      requestId: run.requestId,
      roomId: run.roomId,
    });
  }

  private async learnAliases(run: Run) {
    const { agent } = await this.settings.get();
    if (!agent.memoryEnabled) return;
    const names = run.calls
      .filter(({ tool }) => !tool.readOnly)
      .flatMap(({ arguments: args }) => args.name ?? [])
      .filter((name): name is string => typeof name === 'string');
    await this.memory.learnAlias(run.input.text, names, run.roomId);
  }

  private async fail(run: Run, error: unknown) {
    const reason = run.signal.reason as unknown;
    const timedOut = reason instanceof AppError;
    const cancelled = !timedOut && (run.signal.aborted || isAbortError(error));
    const source = timedOut ? reason : error;
    const code = cancelled ? 'cancelled' : source instanceof AppError ? source.code : 'agent_error';
    const message = cancelled ? 'Requête annulée' : errorMessage(source);
    await this.conversations.updateRequest(run.requestId, {
      status: cancelled ? 'cancelled' : 'error',
      error: message,
      durationMs: performance.now() - run.startedAt,
    });
    if (!cancelled) {
      this.logger.log('error', 'agent', message, { requestId: run.requestId, roomId: run.roomId });
      const step = await this.startStep(run, 'error', message);
      await step.finish('error');
    }
    run.emit({ type: 'request.failed', requestId: run.requestId, code, message });
    run.emit({
      type: 'state.changed',
      requestId: run.requestId,
      state: cancelled ? 'idle' : 'error',
    });
  }
}
