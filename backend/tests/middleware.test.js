const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { requireAuth } = require('../src/shared/middleware/requireAuth');
const {
  createRequireVerifiedEmail,
} = require('../src/shared/middleware/requireVerifiedEmail');
const { errorHandler } = require('../src/shared/middleware/errorHandler');

function buildAuthApp() {
  const app = express();
  app.get('/protected', requireAuth, (req, res) => res.json({ user: req.user }));
  app.use(errorHandler);
  return app;
}

function buildVerifiedApp(userRepository) {
  const app = express();
  app.get(
    '/play',
    requireAuth,
    createRequireVerifiedEmail(userRepository),
    (req, res) => res.json({ ok: true })
  );
  app.use(errorHandler);
  return app;
}

function tokenFor(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    config.jwtSecret,
    { expiresIn: '1h' }
  );
}

describe('requireAuth', () => {
  const app = buildAuthApp();

  it('responde 401 cuando no hay token', async () => {
    const response = await request(app).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(response.body.error.message).toBe('Debe iniciar sesión');
  });

  it('responde 401 cuando el token es inválido', async () => {
    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer token-invalido');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('permite el paso con un token válido e inyecta req.user', async () => {
    const user = { id: '10000000-0000-4000-8000-000000000001', username: 'jugador1' };
    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(user);
  });
});

describe('requireVerifiedEmail', () => {
  const user = {
    id: '10000000-0000-4000-8000-000000000001',
    username: 'jugador1',
  };
  const authorization = `Bearer ${tokenFor(user)}`;

  it('responde 403 cuando el usuario no verificó su correo', async () => {
    const userRepository = {
      findById: jest.fn().mockResolvedValue({
        id: user.id,
        emailVerified: false,
      }),
    };
    const response = await request(buildVerifiedApp(userRepository))
      .get('/play')
      .set('Authorization', authorization);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(response.body.error.message).toBe(
      'Debe verificar su correo para jugar'
    );
    expect(userRepository.findById).toHaveBeenCalledWith(user.id);
  });

  it('permite el paso cuando el correo está verificado', async () => {
    const userRepository = {
      findById: jest.fn().mockResolvedValue({
        id: user.id,
        emailVerified: true,
      }),
    };
    const response = await request(buildVerifiedApp(userRepository))
      .get('/play')
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
