import type { ApiKey } from '@ayko/contracts';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface IdentityRepository {
  countUsers(): Promise<number>;
  createUser(user: UserRecord): Promise<void>;
  findUserByName(username: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  createSession(session: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<void>;
  findUserBySession(tokenHash: string, nowIso: string): Promise<UserRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  listApiKeys(): Promise<ApiKey[]>;
  createApiKey(key: ApiKey & { tokenHash: string }): Promise<void>;
  touchApiKey(tokenHash: string, nowIso: string): Promise<boolean>;
  deleteApiKey(id: string): Promise<boolean>;
}
