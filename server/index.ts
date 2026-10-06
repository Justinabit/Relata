import { config, aiConfigured } from './config.js';
import { createApp } from './app.js';

const app = createApp();
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`Relata API listening on :${config.port} (${config.env})`);
  console.log(
    `AI: gemini=${aiConfigured('gemini') ? 'configured' : 'not configured'}, openai=${aiConfigured('openai') ? 'configured' : 'not configured'}, primary=${config.ai.primary}`,
  );
  console.log(`OpenAlex API key: ${config.openalex.apiKey ? 'configured' : 'not configured (shared keyless budget applies)'}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set PORT to another value.` : `Server error: ${err.message}`);
  process.exit(1);
});

// Let in-flight requests finish on Ctrl+C / container stop instead of cutting them off.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down…`);
  server.close(() => process.exit(0));
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r instanceof Error ? r.message : 'unknown'));
