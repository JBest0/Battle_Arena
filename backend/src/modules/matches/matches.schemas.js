const { z } = require('zod');

const matchIdParamsSchema = z.object({
  id: z
    .string({
      required_error: 'Identificador de partida inválido',
      invalid_type_error: 'Identificador de partida inválido',
    })
    .uuid('Identificador de partida inválido'),
});

module.exports = { matchIdParamsSchema };
