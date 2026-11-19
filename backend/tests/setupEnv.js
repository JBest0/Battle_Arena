const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://arena:arena@localhost:5432/arena_test';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '8h';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.MAIL_FROM = 'Battle Arena <no-reply@battlearena.local>';
process.env.UPLOADS_DIR = path.join(os.tmpdir(), 'battle-arena-test-uploads');
process.env.GITHUB_CLIENT_ID = '';
process.env.GITHUB_CLIENT_SECRET = '';
process.env.OAUTH_REDIRECT_URI =
  'http://localhost:5173/api/auth/oauth/github/callback';
