import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { ApiKeyCreated, Credentials, User } from '@ayko/contracts';
import type {
  IdentityRepository,
  UserRecord,
} from '../../domain/identity/repositories/IdentityRepository.js';
import { AppError, conflict, notFound, unauthorized } from '../../shared/errors.js';

const SESSION_DAYS = 14;

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const toUser = ({ id, username, createdAt }: UserRecord): User => ({ id, username, createdAt });

export class AuthService {
  constructor(private readonly repository: IdentityRepository) {}

  async needsSetup() {
    return (await this.repository.countUsers()) === 0;
  }

  /** First-run only: once an admin exists this route is closed for good. */
  async createFirstAdmin(credentials: Credentials) {
    if (!(await this.needsSetup())) throw conflict('Un administrateur existe déjà');
    const user: UserRecord = {
      id: randomUUID(),
      username: credentials.username,
      passwordHash: await hash(credentials.password),
      createdAt: new Date().toISOString(),
    };
    await this.repository.createUser(user);
    return this.openSession(user);
  }

  async login({ username, password }: Credentials) {
    const user = await this.repository.findUserByName(username);
    if (!user || !(await verify(user.passwordHash, password))) {
      throw new AppError('invalid_credentials', 'Identifiant ou mot de passe incorrect', 401);
    }
    return this.openSession(user);
  }

  private async openSession(user: UserRecord) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await this.repository.createSession({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    });
    return { user: toUser(user), token, expiresAt };
  }

  async logout(token: string) {
    await this.repository.deleteSession(hashToken(token));
  }

  async userFromSession(token: string): Promise<User | null> {
    const user = await this.repository.findUserBySession(
      hashToken(token),
      new Date().toISOString(),
    );
    return user ? toUser(user) : null;
  }

  async verifyApiKey(token: string) {
    return this.repository.touchApiKey(hashToken(token), new Date().toISOString());
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.repository.findUserById(userId);
    if (!user) throw unauthorized();
    if (!(await verify(user.passwordHash, currentPassword))) {
      throw new AppError('invalid_credentials', 'Mot de passe actuel incorrect', 401);
    }
    await this.repository.updatePassword(userId, await hash(newPassword));
    await this.repository.deleteUserSessions(userId);
    return this.openSession(user);
  }

  listApiKeys() {
    return this.repository.listApiKeys();
  }

  async createApiKey(name: string): Promise<ApiKeyCreated> {
    const token = `ayko_${randomBytes(24).toString('base64url')}`;
    const key = {
      id: randomUUID(),
      name,
      prefix: token.slice(0, 10),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    await this.repository.createApiKey({ ...key, tokenHash: hashToken(token) });
    return { ...key, token };
  }

  async deleteApiKey(id: string) {
    if (!(await this.repository.deleteApiKey(id))) throw notFound('Clé');
  }
}
