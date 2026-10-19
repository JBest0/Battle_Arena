const { AppError } = require('../AppError');

function validate(schema, source = 'body') {
  return function validateMiddleware(req, res, next) {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const fields = {};
      for (const issue of result.error.issues) {
        const key = issue.path.length > 0 ? issue.path.join('.') : source;
        if (!fields[key]) {
          fields[key] = issue.message;
        }
      }
      return next(
        new AppError(400, 'VALIDATION_ERROR', 'Revise los campos marcados', fields)
      );
    }

    req[source] = result.data;
    return next();
  };
}

module.exports = { validate };
