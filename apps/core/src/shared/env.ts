import { createHash } from 'node:crypto';
import { z } from 'zod';

const schema = z.object({
  AYKO_HOST: z.string().default('0.0.0.0'),
  AYKO_PORT: z.coerce.number().int().default(3100),
  AYKO_PUBLIC_URL: z.string().default('http://localhost:3100'),
  AYKO_DATA_DIR: z.string().default('./data'),
  AYKO_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  AYKO_MOCK: z
    .string()
    .default('false')
    .transform((value) => value === 'true' || value === '1'),
  AYKO_MASTER_KEY: z.string().optional(),
  AYKO_CORS_ORIGINS: z.string().default(''),
  AYKO_BACKOFFICE_DIR: z.string().optional(),
  AYKO_FAKE_OLLAMA_PORT: z.coerce.number().int().default(11535),
});

export interface Env {
  host: string;
  port: number;
  publicUrl: string;
  dataDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  mock: boolean;
  masterKey: Buffer;
  corsOrigins: string[];
  backofficeDir: string | null;
  fakeOllamaPort: number;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.parse(source);
  if (!parsed.AYKO_MASTER_KEY && !parsed.AYKO_MOCK) {
    throw new Error('AYKO_MASTER_KEY is required outside mock mode (openssl rand -hex 32)');
  }
  const rawKey = parsed.AYKO_MASTER_KEY ?? 'ayko-mock-mode-only-master-key';
  const origins = parsed.AYKO_CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return {
    host: parsed.AYKO_HOST,
    port: parsed.AYKO_PORT,
    publicUrl: parsed.AYKO_PUBLIC_URL,
    dataDir: parsed.AYKO_DATA_DIR,
    logLevel: parsed.AYKO_LOG_LEVEL,
    mock: parsed.AYKO_MOCK,
    // Any passphrase is accepted: the digest always yields a 256-bit AES key.
    masterKey: createHash('sha256').update(rawKey).digest(),
    corsOrigins: origins,
    backofficeDir: parsed.AYKO_BACKOFFICE_DIR ?? null,
    fakeOllamaPort: parsed.AYKO_FAKE_OLLAMA_PORT,
  };
}
