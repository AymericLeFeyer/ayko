import type { ModelRole, ModelRoleName, OllamaEndpoint } from '@ayko/contracts';

export type EndpointRecord = Omit<OllamaEndpoint, 'host'> & { headersSecretId: string | null };

export interface LlmRepository {
  listEndpoints(): Promise<EndpointRecord[]>;
  findEndpoint(id: string): Promise<EndpointRecord | null>;
  saveEndpoint(endpoint: EndpointRecord): Promise<void>;
  deleteEndpoint(id: string): Promise<boolean>;
  recordHealth(
    id: string,
    health: {
      lastStatus: 'up' | 'down';
      lastLatencyMs: number | null;
      lastCheckedAt: string;
      version: string | null;
    },
  ): Promise<void>;
  listRoles(): Promise<ModelRole[]>;
  findRole(role: ModelRoleName): Promise<ModelRole | null>;
  saveRole(role: ModelRole): Promise<void>;
}
