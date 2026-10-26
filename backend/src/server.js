const app = require('./app');
const config = require('./config');
const { tokenCleanupJob } = require('./container');
const { startRealtime } = require('./modules/realtime');

const server = app.listen(config.port, () => {
  console.log(`Battle Arena API escuchando en el puerto ${config.port}`);
});

// WebSockets de la arena: comparten el mismo servidor HTTP y puerto.
const realtime = startRealtime(server);

tokenCleanupJob.start();

async function shutdown() {
  tokenCleanupJob.stop();
  await realtime.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
