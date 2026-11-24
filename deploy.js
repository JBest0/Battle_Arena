const { spawnSync } = require('child_process');
const crypto = require('crypto');
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

function getEnvValue(content, key) {
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim().replace(/^"|"$/g, '') : '';
}

function validateProtectedConfig(content) {
  const smtpHost = getEnvValue(content, 'SMTP_HOST');
  const smtpPort = getEnvValue(content, 'SMTP_PORT');
  const smtpUser = getEnvValue(content, 'SMTP_USER');
  const smtpPass = getEnvValue(content, 'SMTP_PASS');
  const mailFrom = getEnvValue(content, 'MAIL_FROM');
  const jwtSecret = getEnvValue(content, 'JWT_SECRET');

  if (!smtpHost || !smtpPort) {
    return 'Falta la configuración SMTP_HOST/SMTP_PORT';
  }
  if (
    smtpHost === 'mailpit' &&
    (smtpUser || smtpPass)
  ) {
    return 'La configuración SMTP mezcla Mailpit con credenciales externas';
  }
  if (
    smtpHost !== 'mailpit' &&
    (!smtpUser ||
      !smtpPass ||
      smtpUser.includes('tu-cuenta') ||
      smtpPass.includes('tu-'))
  ) {
    return 'Falta configurar SMTP_USER/SMTP_PASS reales';
  }
  if (!mailFrom || mailFrom.includes('tu-cuenta')) {
    return 'Falta configurar MAIL_FROM';
  }
  if (!jwtSecret || jwtSecret === 'cambiar') {
    return 'Falta configurar JWT_SECRET';
  }
  return null;
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

const mode = (process.argv[2] || 'lan').toLowerCase();

if (!['local', 'lan', 'phone'].includes(mode)) {
  console.error('Modo no válido. Usa: node deploy.js');
  console.error('                 o: node deploy.js local');
  console.error('                 o: node deploy.js lan');
  console.error('                 o: node deploy.js lan 192.168.100.239');
  process.exit(1);
}

const autoIp = findLanIp();
const suppliedIp = process.argv[3];
const lanIp = suppliedIp || autoIp;
const isLanMode = mode === 'lan' || mode === 'phone';
const isEasyLanMode = mode === 'lan';

let frontendUrl;
if (isEasyLanMode) {
  if (!lanIp) {
    console.error('No se encontró una IP LAN. Indícala manualmente:');
    console.error('node deploy.js lan 192.168.100.239');
    process.exit(1);
  }
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(lanIp)) {
    console.error(`La dirección IP no es válida: ${lanIp}`);
    process.exit(1);
  }
  frontendUrl = `http://${lanIp}:5173`;
} else {
  frontendUrl = 'http://localhost:5173';
}

let envContent;
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
} else {
  const examplePath = path.join(__dirname, 'backend', '.env.example');
  envContent = fs.readFileSync(examplePath, 'utf8');
  console.log('No existe backend/.env; se creó a partir de backend/.env.example.');
}

if (mode === 'lan') {
  const profileCandidates = [
    path.join(__dirname, 'backend', '.env.phone'),
    path.join(__dirname, 'backend', '.env.local'),
  ];
  const profilePath = profileCandidates.find((candidate) => fs.existsSync(candidate));
  if (profilePath) {
    const profileError = validateProfile(profilePath);
    if (profileError) {
      console.error(`Perfil OAuth invalido: backend/${path.basename(profilePath)}`);
      console.error(profileError);
      process.exit(1);
    }
    envContent = applyProfile(envContent, profilePath);
    console.log(`Perfil cargado: backend/${path.basename(profilePath)}`);
  }
} else {
  const profileName = mode === 'phone' ? '.env.phone' : '.env.local';
  const profilePath = path.join(__dirname, 'backend', profileName);
  if (fs.existsSync(profilePath)) {
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
    console.error(`Falta el perfil OAuth: backend/${profileName}`);
    console.error(
      `Crea backend/${profileName} y agrega las credenciales reales.`
    );
    process.exit(1);
  }
}

envContent = setEnvValue(envContent, 'FRONTEND_URL', frontendUrl);
envContent = setEnvValue(envContent, 'CORS_ORIGIN', frontendUrl);
envContent = setEnvValue(
  envContent,
  'OAUTH_REDIRECT_URI',
  `${frontendUrl}/api/auth/oauth/github/callback`
);

const smtpHost = getEnvValue(envContent, 'SMTP_HOST');
const smtpUser = getEnvValue(envContent, 'SMTP_USER');
const mailFrom = getEnvValue(envContent, 'MAIL_FROM');
if (smtpHost !== 'mailpit' && smtpUser && mailFrom.includes('battle-arena.local')) {
  envContent = setEnvValue(
    envContent,
    'MAIL_FROM',
    `"Battle Arena <${smtpUser}>"`
  );
}

const protectedConfigError = validateProtectedConfig(envContent);
if (protectedConfigError) {
  console.error(`Configuración protegida inválida: ${protectedConfigError}`);
  console.error('Revisa backend/.env antes de desplegar.');
  process.exit(1);
}

if (isEasyLanMode) {
  if (!/^JWT_SECRET=(?!cambiar$).+/m.test(envContent)) {
    envContent = setEnvValue(
      envContent,
      'JWT_SECRET',
      crypto.randomBytes(32).toString('hex')
    );
  }
}

fs.writeFileSync(envPath, envContent, 'utf8');
if (process.platform !== 'win32') {
  fs.chmodSync(envPath, 0o600);
}

console.log(`Configuración: ${isLanMode ? 'acceso en red local' : 'acceso local'}`);
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
console.log(`API:              ${isLanMode ? `http://${lanIp}:3000/api` : 'http://localhost:3000/api'}`);
console.log(`Health check:     ${isLanMode ? `http://${lanIp}:3000/api/health` : 'http://localhost:3000/api/health'}`);
if (smtpHost === 'mailpit') {
  console.log('Mailpit:          http://localhost:8025');
}

if (isEasyLanMode) {
  console.log('\nDesde otra computadora, abre la URL de Aplicación.');
  console.log('Callback de GitHub OAuth:');
  console.log(`${frontendUrl}/api/auth/oauth/github/callback`);
  console.log('Debe estar registrado exactamente en la aplicación OAuth de GitHub.');
  console.log('Si no carga, permite el puerto TCP 5173 en el firewall del servidor.');
} else if (mode === 'phone') {
  console.log('\nGitHub OAuth móvil requiere un callback separado:');
  console.log(`${frontendUrl}/api/auth/oauth/github/callback`);
  console.log('Regresa a modo normal con: node deploy.js local');
}
