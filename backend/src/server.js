const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`Battle Arena API escuchando en el puerto ${config.port}`);
});
