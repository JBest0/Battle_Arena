const request = require('supertest');

jest.mock('../src/infrastructure/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

const app = require('../src/app');

describe('GET /api/health', () => {
  it('responde 200 con el estado de la API y la base de datos', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', db: 'ok' });
  });
});
