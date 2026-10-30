// Starts the production build in mock mode on a throwaway database.
import { rmSync } from 'node:fs';

const dataDir = 'data/e2e';
rmSync(dataDir, { recursive: true, force: true });

Object.assign(process.env, {
  AYKO_MOCK: 'true',
  AYKO_PORT: '3110',
  AYKO_PUBLIC_URL: 'http://localhost:3110',
  AYKO_DATA_DIR: dataDir,
  AYKO_BACKOFFICE_DIR: 'apps/backoffice/dist',
  AYKO_FAKE_OLLAMA_PORT: '0',
});

await import('../apps/core/dist/main.js');
