import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Vault } from '../../domain/system/Vault.js';
import type { Db } from '../db/client.js';
import { secrets } from '../db/schema.js';

export class AesVault implements Vault {
  constructor(
    private readonly db: Db,
    private readonly key: Buffer,
  ) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
  }

  decrypt(ciphertext: string): string {
    const [iv, tag, data] = ciphertext.split('.').map((part) => Buffer.from(part, 'base64'));
    if (!iv || !tag || !data) throw new Error('Malformed secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  async store(value: Record<string, string>, existingId?: string | null): Promise<string> {
    const ciphertext = this.encrypt(JSON.stringify(value));
    const id = existingId ?? randomUUID();
    this.db
      .insert(secrets)
      .values({ id, ciphertext, createdAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: secrets.id, set: { ciphertext } })
      .run();
    return id;
  }

  async read(id: string | null | undefined): Promise<Record<string, string>> {
    if (!id) return {};
    const row = this.db.select().from(secrets).where(eq(secrets.id, id)).get();
    return row ? (JSON.parse(this.decrypt(row.ciphertext)) as Record<string, string>) : {};
  }

  async remove(id: string | null | undefined): Promise<void> {
    if (id) this.db.delete(secrets).where(eq(secrets.id, id)).run();
  }
}
