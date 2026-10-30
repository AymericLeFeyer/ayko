import { randomUUID } from 'node:crypto';
import type { Memory, memoryInput } from '@ayko/contracts';
import type { z } from 'zod';
import { cosineSimilarity } from '../../domain/cache/services/similarity.js';
import type {
  MemoryRecord,
  MemoryRepository,
} from '../../domain/memory/repositories/MemoryRepository.js';
import {
  aliasContent,
  keywords,
  keywordScore,
  learnableAlias,
  plain,
} from '../../domain/memory/services/memoryRules.js';
import type { Logger } from '../../domain/system/Logger.js';
import { errorMessage, notFound } from '../../shared/errors.js';
import type { OllamaService } from '../llm/OllamaService.js';
import type { RoomService } from '../rooms/RoomService.js';
import type { SettingsService } from '../system/SettingsService.js';

type MemoryFields = z.output<typeof memoryInput>;

const SIMILARITY_THRESHOLD = 0.6;
const EMBEDDING_TIMEOUT_MS = 2000;

export class MemoryService {
  constructor(
    private readonly repository: MemoryRepository,
    private readonly ollama: OllamaService,
    private readonly rooms: RoomService,
    private readonly settings: SettingsService,
    private readonly logger: Logger,
  ) {}

  private async toDto({ aliasKey: _key, embedding: _vector, ...memory }: MemoryRecord) {
    const room = await this.rooms.describeRoom(memory.roomId);
    return { ...memory, roomName: room.name } satisfies Memory;
  }

  async list() {
    const memories = await this.repository.list();
    return Promise.all(memories.map((memory) => this.toDto(memory)));
  }

  /** Semantic search is a bonus: keywords still work when no model answers. */
  private async embed(text: string, signal?: AbortSignal) {
    const role = await this.ollama.getRole('embeddings');
    if (!role?.model) return null;
    try {
      const timeout = AbortSignal.timeout(EMBEDDING_TIMEOUT_MS);
      return await this.ollama.embed(
        role.model,
        text,
        signal ? AbortSignal.any([signal, timeout]) : timeout,
      );
    } catch (error) {
      this.logger.log('debug', 'memory', `Embeddings indisponibles : ${errorMessage(error)}`);
      return null;
    }
  }

  private async store(
    fields: MemoryFields,
    source: Memory['source'],
    aliasKey: string | null = null,
    id: string = randomUUID(),
  ) {
    const now = new Date().toISOString();
    const record: MemoryRecord = {
      ...fields,
      id,
      source,
      aliasKey,
      embedding: await this.embed(fields.content),
      useCount: 0,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
    };
    await this.repository.save(record);
    return record;
  }

  async create(fields: MemoryFields) {
    return this.toDto(await this.store(fields, 'admin'));
  }

  async update(id: string, patch: Partial<MemoryFields>) {
    const current = await this.repository.find(id);
    if (!current) throw notFound('Souvenir');
    const changed = patch.content !== undefined && patch.content !== current.content;
    const record: MemoryRecord = {
      ...current,
      ...patch,
      // An admin correction is no longer something to overwrite by relearning.
      aliasKey: changed ? null : current.aliasKey,
      embedding: changed ? await this.embed(patch.content as string) : current.embedding,
      updatedAt: new Date().toISOString(),
    };
    await this.repository.save(record);
    return this.toDto(record);
  }

  async delete(id: string) {
    if (!(await this.repository.delete(id))) throw notFound('Souvenir');
  }

  async remember(fact: string) {
    const memories = await this.repository.list();
    if (memories.some((memory) => plain(memory.content) === plain(fact))) return;
    await this.store({ content: fact.slice(0, 500), roomId: null, pinned: false }, 'user');
  }

  /** Removes the closest memory, or tells the caller nothing matched. */
  async forget(query: string): Promise<string | null> {
    const wanted = keywords(query);
    const memories = await this.repository.list();
    const ranked = memories
      .map((memory) => ({ memory, score: keywordScore(wanted, memory.content) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = ranked[0]?.memory;
    if (!best) return null;
    await this.repository.delete(best.id);
    return best.content;
  }

  /** Called only after an action really succeeded through the model. */
  async learnAlias(text: string, deviceNames: string[], roomId: string | null) {
    const alias = learnableAlias(text, deviceNames);
    if (!alias) return;
    const content = aliasContent(alias, deviceNames);
    const key = `${alias}|${roomId ?? '*'}`;
    const existing = await this.repository.findByAlias(key);
    if (existing?.content === content) return;
    await this.store({ content, roomId, pinned: false }, 'learned', key, existing?.id);
  }

  /**
   * What goes in the prompt: pinned memories, then those related to the sentence. A small
   * memory is sent whole, since filtering a handful of lines would only risk missing one.
   */
  async recall(text: string, roomId: string | null, signal?: AbortSignal): Promise<string[]> {
    const { agent } = await this.settings.get();
    if (!agent.memoryEnabled) return [];
    const memories = (await this.repository.list()).filter(
      (memory) => memory.roomId === null || memory.roomId === roomId,
    );
    const limit = agent.memoryMaxItems;
    const selected =
      memories.length <= limit ? memories : await this.select(memories, text, limit, signal);
    if (selected.length === 0) return [];
    await this.repository.markUsed(
      selected.map((memory) => memory.id),
      new Date().toISOString(),
    );
    return selected.map((memory) => memory.content);
  }

  private async select(
    memories: MemoryRecord[],
    text: string,
    limit: number,
    signal?: AbortSignal,
  ) {
    const pinned = memories.filter((memory) => memory.pinned);
    const wanted = keywords(text);
    const vector = memories.some((memory) => memory.embedding)
      ? await this.embed(text, signal)
      : null;
    const related = memories
      .filter((memory) => !memory.pinned)
      .map((memory) => {
        const similarity =
          vector && memory.embedding ? cosineSimilarity(vector, memory.embedding) : 0;
        const semantic = similarity >= SIMILARITY_THRESHOLD ? similarity : 0;
        return { memory, score: keywordScore(wanted, memory.content) + semantic };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.memory);
    return [...pinned, ...related].slice(0, Math.max(limit, pinned.length));
  }
}
