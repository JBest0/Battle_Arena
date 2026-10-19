const { AppError } = require('../AppError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        fields: err.fields ?? null,
      },
    });
  }

  console.error('Error no controlado:', err);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error interno',
      fields: null,
    },
  });
}

module.exports = { errorHandler };
