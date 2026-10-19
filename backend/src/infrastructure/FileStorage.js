const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const config = require('../config');
const { AppError } = require('../shared/AppError');

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const AVATAR_SIZE = 256;
const AVATAR_SUBDIR = 'avatars';
const AVATAR_URL_PREFIX = '/uploads/avatars/';

const ALLOWED_MIME_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'png';
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  const riff = buffer.toString('ascii', 0, 4);
  const webp = buffer.toString('ascii', 8, 12);
  if (riff === 'RIFF' && webp === 'WEBP') {
    return 'webp';
  }

  return null;
}

class FileStorage {
  constructor(options = config) {
    this.uploadsDir = options.uploadsDir;
    this.avatarsDir = path.join(this.uploadsDir, AVATAR_SUBDIR);
    fs.mkdirSync(this.avatarsDir, { recursive: true });
  }

  async saveAvatar(buffer) {
    if (!detectImageType(buffer)) {
      throw new AppError(
        400,
        'INVALID_IMAGE',
        'El archivo no es una imagen válida'
      );
    }

    const filename = `${crypto.randomUUID()}.webp`;
    const destination = path.join(this.avatarsDir, filename);

    try {
      await sharp(buffer)
        .rotate()
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(destination);
    } catch (err) {
      await fs.promises.rm(destination, { force: true }).catch(() => {});
      throw new AppError(
        400,
        'INVALID_IMAGE',
        'El archivo no es una imagen válida'
      );
    }

    return {
      url: `${AVATAR_URL_PREFIX}${filename}`,
      path: destination,
    };
  }

  async deleteAvatarFile(url) {
    if (typeof url !== 'string' || !url.startsWith(AVATAR_URL_PREFIX)) {
      return;
    }

    const filename = url.slice(AVATAR_URL_PREFIX.length);

    if (!filename || path.basename(filename) !== filename) {
      return;
    }

    await fs.promises
      .rm(path.join(this.avatarsDir, filename), { force: true })
      .catch(() => {});
  }
}

const storage = multer.memoryStorage();

function multerErrorToAppError(err) {
  if (err instanceof AppError) {
    return err;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new AppError(
        400,
        'FILE_TOO_LARGE',
        'La imagen no puede superar 2 MB'
      );
    }

    return new AppError(400, 'INVALID_FILE', 'No se pudo procesar el archivo');
  }

  return new AppError(400, 'INVALID_FILE', 'Archivo inválido');
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      return callback(
        new AppError(
          400,
          'INVALID_FILE_TYPE',
          'Solo se permiten imágenes PNG, JPG o WEBP'
        )
      );
    }
    return callback(null, true);
  },
}).single('avatar');

function uploadAvatarMiddleware(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      return next(multerErrorToAppError(err));
    }

    if (!req.file || !req.file.buffer) {
      return next(
        new AppError(400, 'FILE_REQUIRED', 'Selecciona una imagen')
      );
    }

    return next();
  });
}

module.exports = {
  FileStorage,
  uploadAvatarMiddleware,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  detectImageType,
};
