const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const envPath = path.join(__dirname, 'backend', '.env');

function run(command, args) {
  return spawnSync(command, args, {
    cwd: __dirname,
    stdio: 'inherit',
  });
}

function setEnvValue(content, key, value) {
  const expression = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;

  if (expression.test(content)) {
    return content.replace(expression, line);
  }

  const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  return `${content}${separator}${line}\n`;
}

function applyProfile(content, profilePath) {
  if (!fs.existsSync(profilePath)) return content;

  for (const rawLine of fs.readFileSync(profilePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    content = setEnvValue(content, key, value);
  }

  return content;
}

function validateProfile(profilePath) {
  if (!fs.existsSync(profilePath)) return null;

  const values = {};
  for (const rawLine of fs.readFileSync(profilePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 1) continue;

    values[line.slice(0, separatorIndex).trim()] =
      line.slice(separatorIndex + 1).trim();
  }

  const clientId = values.GITHUB_CLIENT_ID || '';
  const clientSecret = values.GITHUB_CLIENT_SECRET || '';
  if (
    !clientId ||
    !clientSecret ||
    clientId.startsWith('CLIENT_ID_') ||
    clientSecret.startsWith('CLIENT_SECRET_')
  ) {
    return 'El perfil contiene valores vacíos o de ejemplo';
  }

  return null;
}

function findLanIp() {
  const candidates = [];

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const address of interfaces || []) {
      if (address.internal || address.family !== 'IPv4') continue;
      candidates.push(address.address);
    }
  }

  const lanIp = candidates.find(
    (ip) => ip.startsWith('192.168.') && !ip.startsWith('192.168.56.')
  );

  if (lanIp) return lanIp;
  return candidates.find((ip) => ip.startsWith('10.') || ip.startsWith('172.'));
}

const mode = (process.argv[2] || 'local').toLowerCase();

if (!['local', 'phone'].includes(mode)) {
  console.error('Modo no válido. Usa: node deploy.js local');
  console.error('                 o: node deploy.js phone');
  console.error('                 o: node deploy.js phone 192.168.100.239');
  process.exit(1);
}

if (!fs.existsSync(envPath)) {
  console.error(`No existe ${envPath}`);
  console.error('Copia backend/.env.example como backend/.env y configura sus valores.');
  process.exit(1);
}

const autoIp = findLanIp();
const suppliedIp = process.argv[3];
const phoneIp = suppliedIp || autoIp;

let frontendUrl;
if (mode === 'phone') {
  if (!phoneIp) {
    console.error('No se encontró una IP LAN. Indícala manualmente:');
    console.error('node deploy.js phone 192.168.100.239');
    process.exit(1);
  }
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(phoneIp)) {
    console.error(`La dirección IP no es válida: ${phoneIp}`);
    process.exit(1);
  }
  frontendUrl = `http://${phoneIp}:5173`;
} else {
  frontendUrl = 'http://localhost:5173';
}

let envContent = fs.readFileSync(envPath, 'utf8');
const profilePath = path.join(
  __dirname,
  'backend',
  mode === 'phone' ? '.env.phone' : '.env.local'
);
const profileExists = fs.existsSync(profilePath);
if (profileExists) {
  const profileError = validateProfile(profilePath);
  if (profileError) {
    console.error(`Perfil OAuth inválido: backend/${path.basename(profilePath)}`);
    console.error(profileError);
    console.error('Reemplaza los datos de ejemplo con los ID y secret reales.');
    process.exit(1);
  }
  envContent = applyProfile(envContent, profilePath);
  console.log(`Perfil cargado: backend/${path.basename(profilePath)}`);
} else {
  console.error(`Falta el perfil OAuth: backend/${path.basename(profilePath)}`);
  console.error(
    `Crea uno desde backend/.env.${mode}.example y agrega las credenciales reales.`
  );
  process.exit(1);
}
envContent = setEnvValue(envContent, 'FRONTEND_URL', frontendUrl);
envContent = setEnvValue(envContent, 'CORS_ORIGIN', frontendUrl);
envContent = setEnvValue(
  envContent,
  'OAUTH_REDIRECT_URI',
  `${frontendUrl}/api/auth/oauth/github/callback`
);
fs.writeFileSync(envPath, envContent, 'utf8');

console.log(`Configuración: ${mode === 'phone' ? 'acceso desde teléfono' : 'acceso local'}`);
console.log(`FRONTEND_URL: ${frontendUrl}`);

const result = run('docker', ['compose', 'up', '-d', '--build']);

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
console.log(`Aplicación:       ${frontendUrl}`);
console.log(`Panel de pruebas: ${frontendUrl}/test`);
console.log(`Registro:         ${frontendUrl}/register`);
console.log(`API:              ${mode === 'phone' ? `http://${phoneIp}:3000/api` : 'http://localhost:3000/api'}`);
console.log(`Health check:     ${mode === 'phone' ? `http://${phoneIp}:3000/api/health` : 'http://localhost:3000/api/health'}`);
console.log('Mailpit:          http://localhost:8025');

if (mode === 'phone') {
  console.log('\nGitHub OAuth móvil requiere un callback separado:');
  console.log(`${frontendUrl}/api/auth/oauth/github/callback`);
  console.log('Regresa a modo normal con: node deploy.js local');
}
