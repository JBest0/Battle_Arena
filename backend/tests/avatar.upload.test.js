const fs = require('fs');
const os = require('os');
const path = require('path');

const uploadsDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'arena-avatars-upload-')
);
process.env.UPLOADS_DIR = uploadsDir;

const avatarsDir = path.join(uploadsDir, 'avatars');

const request = require('supertest');
const sharp = require('sharp');
const app = require('../src/app');
const { prisma } = require('../src/infrastructure/prisma');
const { avatarRepository } = require('../src/container');
const {
  DEFAULT_AVATARS,
  clearPlayers,
  createPlayer,
  filePathForUrl,
  imageBuffer,
  seedDefaultAvatars,
  tokenFor,
} = require('./helpers/avatarFixtures');

let userA;
let tokenA;

function upload(buffer, { filename = 'avatar.png', contentType = 'image/png' } = {}) {
  return request(app)
    .post('/api/users/me/avatar/upload')
    .set('Authorization', `Bearer ${tokenA}`)
    .attach('avatar', buffer, { filename, contentType });
}

function uploadedAvatarsOf(userId) {
  return prisma.avatar.findMany({ where: { ownerId: userId, type: 'UPLOADED' } });
}

beforeAll(async () => {
  await clearPlayers();
  await seedDefaultAvatars();
});

beforeEach(async () => {
  await clearPlayers();
  fs.mkdirSync(avatarsDir, { recursive: true });

  userA = await createPlayer({
    username: 'jugador_a',
    email: 'jugador_a@test.com',
    avatarId: DEFAULT_AVATARS[0].id,
  });
  tokenA = tokenFor(userA);
});

afterAll(async () => {
  await clearPlayers();
  await prisma.$disconnect();
  fs.rmSync(uploadsDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
});

describe('POST /api/users/me/avatar/upload', () => {
  it('CA-06.3: sube un PNG y lo normaliza a WEBP 256x256', async () => {
    const response = await upload(await imageBuffer('png'));

    expect(response.status).toBe(201);
    expect(response.body.user.avatarUrl).toMatch(
      /^\/uploads\/avatars\/[0-9a-f-]+\.webp$/
    );

    const filePath = filePathForUrl(response.body.user.avatarUrl);
    expect(fs.existsSync(filePath)).toBe(true);

    const metadata = await sharp(filePath).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);

    const stored = await prisma.avatar.findFirst({
      where: { ownerId: userA.id, type: 'UPLOADED' },
    });
    expect(stored).not.toBeNull();
    expect(stored.url).toBe(response.body.user.avatarUrl);

    const served = await request(app).get(response.body.user.avatarUrl);
    expect(served.status).toBe(200);
  });

  it('acepta también JPEG y WEBP', async () => {
    const jpeg = await upload(await imageBuffer('jpeg'), {
      filename: 'avatar.jpg',
      contentType: 'image/jpeg',
    });
    expect(jpeg.status).toBe(201);
    expect(jpeg.body.user.avatarUrl).toMatch(/\.webp$/);

    const webp = await upload(await imageBuffer('webp', '#0000ff'), {
      filename: 'avatar.webp',
      contentType: 'image/webp',
    });
    expect(webp.status).toBe(201);
    expect(webp.body.user.avatarUrl).toMatch(/\.webp$/);
  });

  it('al subir otra imagen reemplaza la anterior en base de datos y disco', async () => {
    const first = await upload(await imageBuffer('png', '#ff0000'));
    expect(first.status).toBe(201);

    const firstUrl = first.body.user.avatarUrl;
    const firstPath = filePathForUrl(firstUrl);
    const firstRecord = (await uploadedAvatarsOf(userA.id))[0];

    const second = await upload(await imageBuffer('png', '#00ff00'));
    expect(second.status).toBe(201);

    expect(fs.existsSync(firstPath)).toBe(false);
    expect(await prisma.avatar.findUnique({ where: { id: firstRecord.id } })).toBeNull();

    const remaining = await uploadedAvatarsOf(userA.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].url).toBe(second.body.user.avatarUrl);
  });

  it('conserva el avatar subido al volver a un default', async () => {
    const uploadResponse = await upload(await imageBuffer('png'));
    const uploadedUrl = uploadResponse.body.user.avatarUrl;

    const select = await request(app)
      .put('/api/users/me/avatar')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ avatarId: DEFAULT_AVATARS[2].id });

    expect(select.status).toBe(200);

    const records = await uploadedAvatarsOf(userA.id);
    expect(records).toHaveLength(1);
    expect(fs.existsSync(filePathForUrl(uploadedUrl))).toBe(true);

    const options = await request(app)
      .get('/api/users/me/avatars')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(options.status).toBe(200);
    expect(options.body.uploaded).toEqual({
      id: records[0].id,
      url: uploadedUrl,
    });
  });

  it('rechaza un archivo que no es imagen por su tipo', async () => {
    const response = await upload(Buffer.from('hola'), {
      filename: 'nota.txt',
      contentType: 'text/plain',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(response.body.error.message).toBe(
      'Solo se permiten imágenes PNG, JPG o WEBP'
    );
  });

  it('rechaza un texto con mimetype de imagen falso', async () => {
    const response = await upload(Buffer.from('esto no es un png'), {
      filename: 'falso.png',
      contentType: 'image/png',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_IMAGE');
    expect(response.body.error.message).toBe(
      'El archivo no es una imagen válida'
    );
  });

  it('rechaza imágenes de más de 2 MB', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 1);

    const response = await upload(big, {
      filename: 'grande.png',
      contentType: 'image/png',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
    expect(response.body.error.message).toBe(
      'La imagen no puede superar 2 MB'
    );
  });

  it('exige un archivo', async () => {
    const response = await request(app)
      .post('/api/users/me/avatar/upload')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('FILE_REQUIRED');
    expect(response.body.error.message).toBe('Selecciona una imagen');
  });

  it('no deja archivos huérfanos si falla la transacción', async () => {
    const before = fs.readdirSync(avatarsDir);
    const spy = jest
      .spyOn(avatarRepository, 'createUploaded')
      .mockRejectedValueOnce(new Error('fallo simulado de transacción'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const response = await upload(await imageBuffer('png'));

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(fs.readdirSync(avatarsDir)).toEqual(before);
    } finally {
      spy.mockRestore();
      consoleError.mockRestore();
    }
  });
});
