const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { AppError } = require('../shared/AppError');

const ALLOWED_MIME_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

class FileStorage {
  constructor(options = config) {
    this.uploadsDir = options.uploadsDir;
    fs.mkdirSync(this.uploadsDir, { recursive: true });
  }

  saveAvatar(file) {
    return `/uploads/${file.filename}`;
  }
}

function uniqueName(originalName, mimetype) {
  const extension =
    ALLOWED_MIME_TYPES[mimetype] || path.extname(originalName).toLowerCase() || '.bin';
  return `${crypto.randomUUID()}${extension}`;
}

const storage = multer.diskStorage({
  destination(req, file, callback) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    callback(null, config.uploadsDir);
  },
  filename(req, file, callback) {
    callback(null, uniqueName(file.originalname, file.mimetype));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      return callback(
        new AppError(
          400,
          'INVALID_FILE',
          'Solo se permiten imágenes PNG, JPEG o WebP'
        )
      );
    }
    return callback(null, true);
  },
}).single('avatar');

function uploadAvatar(req, res, next) {
  upload(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof AppError) {
      return next(err);
    }

    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'La imagen supera el tamaño máximo de 2 MB'
          : 'No se pudo procesar el archivo';
      return next(new AppError(400, 'INVALID_FILE', message));
    }

    return next(new AppError(400, 'INVALID_FILE', 'Archivo inválido'));
  });
}

module.exports = {
  FileStorage,
  uploadAvatar,
  ALLOWED_MIME_TYPES,
};
