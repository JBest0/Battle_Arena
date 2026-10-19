const app = require('./app');
const config = require('./config');
const { tokenCleanupJob } = require('./container');

const server = app.listen(config.port, () => {
  console.log(`Battle Arena API escuchando en el puerto ${config.port}`);
});

tokenCleanupJob.start();

function shutdown() {
  tokenCleanupJob.stop();
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
