import { createContainer } from './container.js';
import { buildServer } from './presentation/http/server.js';
import { loadEnv } from './shared/env.js';

const env = loadEnv();
const container = await createContainer(env);
const app = await buildServer(container);

await container.start();
await app.listen({ host: env.host, port: env.port });
container.logger.log('info', 'system', `API disponible sur ${env.publicUrl}`);

const shutdown = async (signal: string) => {
  container.logger.log('info', 'system', `Arrêt demandé (${signal})`);
  await app.close();
  await container.stop();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
