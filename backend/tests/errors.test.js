const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const { validate } = require('../src/shared/middleware/validate');
const { notFound } = require('../src/shared/middleware/notFound');
const { errorHandler } = require('../src/shared/middleware/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json());

  app.post(
    '/api/validated',
    validate(
      z.object({
        name: z.string().min(3),
        age: z.number().int().positive(),
      })
    ),
    (req, res) => res.json(req.body)
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

describe('Manejo de errores', () => {
  const app = buildApp();

  it('responde 404 con el formato único para rutas inexistentes', async () => {
    const response = await request(app).get('/api/no-existe');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Recurso no encontrado',
        fields: null,
      },
    });
  });

  it('responde 400 VALIDATION_ERROR con los campos inválidos', async () => {
    const response = await request(app)
      .post('/api/validated')
      .send({ name: 'ab', age: -1 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBe('Revise los campos marcados');
    expect(response.body.error.fields).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        age: expect.any(String),
      })
    );
  });

  it('reemplaza el body con los datos parseados cuando la validación pasa', async () => {
    const response = await request(app)
      .post('/api/validated')
      .send({ name: 'Jugador', age: 20 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'Jugador', age: 20 });
  });
});
