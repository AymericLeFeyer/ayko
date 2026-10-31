import type {
  ModelParams,
  OllamaModel,
  OllamaModelDetail,
  PullProgress,
  RunningModel,
} from '@ayko/contracts';

export interface LlmToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: LlmToolCall[];
  toolName?: string;
  /** Base64, for vision models. */
  images?: string[];
}

export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmChatRequest {
  model: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  params?: Partial<ModelParams>;
}

export type LlmChunk =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; call: LlmToolCall }
  | {
      type: 'done';
      outputTokens: number | null;
      evalDurationMs: number | null;
      /** The model stopped on a limit (window or `maxTokens`), not because it had finished. */
      truncated?: boolean;
    };

/** Everything Core needs from a model runtime; Ollama is only one implementation. */
export interface LlmProvider {
  version(signal?: AbortSignal): Promise<string>;
  listModels(signal?: AbortSignal): Promise<OllamaModel[]>;
  showModel(name: string, signal?: AbortSignal): Promise<OllamaModelDetail>;
  running(signal?: AbortSignal): Promise<RunningModel[]>;
  pull(name: string, signal?: AbortSignal): AsyncIterable<PullProgress>;
  deleteModel(name: string): Promise<void>;
  chat(request: LlmChatRequest, signal?: AbortSignal): AsyncIterable<LlmChunk>;
  embed(model: string, text: string, signal?: AbortSignal): Promise<number[]>;
}

export interface LlmEndpointConfig {
  url: string;
  headers: Record<string, string>;
  connectTimeoutMs: number;
}

export type LlmProviderFactory = (config: LlmEndpointConfig) => LlmProvider;
