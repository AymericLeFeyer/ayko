import type { Memory } from '@ayko/contracts';

export type MemoryRecord = Omit<Memory, 'roomName'> & {
  /** Identifies a learned alias, so that learning it again replaces it. */
  aliasKey: string | null;
  embedding: number[] | null;
};

export interface MemoryRepository {
  list(): Promise<MemoryRecord[]>;
  find(id: string): Promise<MemoryRecord | null>;
  findByAlias(aliasKey: string): Promise<MemoryRecord | null>;
  save(memory: MemoryRecord): Promise<void>;
  delete(id: string): Promise<boolean>;
  markUsed(ids: string[], nowIso: string): Promise<void>;
}
