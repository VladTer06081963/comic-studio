// web/server.js — hardened Express bootstrap for Comic Studio.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const [{ loadConfig }, { createRuntime }, { createApp }] = await Promise.all([
  import('./lib/config.js'),
  import('./lib/runtime.js'),
  import('./app.js'),
]);

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(JSON.stringify({ level: 'ERROR', component: 'web.config', code: error.code || 'INVALID_CONFIGURATION', message: error.message }));
  process.exit(1);
}

const runtime = createRuntime(config);
const app = createApp(runtime);
const server = app.listen(config.port, config.host, () => {
  runtime.logger.info('web.started', {
    host: config.host,
    port: config.port,
    mode: config.remoteMode ? 'remote' : 'local',
    ui: `http://${config.host}:${config.port}/ui/`,
  });
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  runtime.logger.warn('web.shutdown.started', { signal });
  server.close();
  await runtime.shutdown();
  runtime.logger.info('web.shutdown.complete', { signal });
}

process.once('SIGINT', () => shutdown('SIGINT').finally(() => process.exit(0)));
process.once('SIGTERM', () => shutdown('SIGTERM').finally(() => process.exit(0)));

export { app, server, runtime };
