const { spawnSync } = require('child_process');

const composeArgs = ['compose', 'up', '-d', '--build'];

function run(command, args) {
  return spawnSync(command, args, {
    cwd: __dirname,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

console.log('Iniciando Battle Arena con Docker...');

const result = run('docker', composeArgs);

if (result.error) {
  console.error(
    '\nNo se pudo ejecutar Docker. Asegúrate de que Docker Desktop esté instalado y abierto.'
  );
  console.error(`Detalle: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    `\nDocker Compose terminó con código ${result.status}. Revisa el error mostrado arriba.`
  );
  process.exit(result.status || 1);
}

console.log('\nBattle Arena está desplegado.');
console.log('Aplicación:       http://localhost:5173');
console.log('Panel de pruebas: http://localhost:5173/test');
console.log('Registro:         http://localhost:5173/register');
console.log('API:              http://localhost:3000/api');
console.log('Health check:     http://localhost:3000/api/health');
console.log('Mailpit:          http://localhost:8025');
