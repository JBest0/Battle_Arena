const { z } = require('zod');

const avatarSelectionSchema = z.object({
  avatarId: z
    .string({
      required_error: 'Avatar inválido',
      invalid_type_error: 'Avatar inválido',
    })
    .uuid('Avatar inválido'),
});

const updateProfileSchema = z
  .object({
    displayName: z
      .string({
        invalid_type_error: 'El nombre visible debe ser texto',
      })
      .trim()
      .max(40, 'El nombre visible debe tener como máximo 40 caracteres')
      .transform((value) => (value === '' ? null : value))
      .optional(),
    bio: z
      .string({
        invalid_type_error: 'La biografía debe ser texto',
      })
      .trim()
      .max(200, 'La biografía debe tener como máximo 200 caracteres')
      .transform((value) => (value === '' ? null : value))
      .optional(),
  })
  .refine(
    (data) => data.displayName !== undefined || data.bio !== undefined,
    { message: 'No hay cambios que guardar' }
  );

const paginationSchema = z.object({
  page: z.coerce
    .number({
      invalid_type_error: 'La página debe ser un número',
    })
    .int('La página debe ser un número entero')
    .min(1, 'La página debe ser mayor o igual a 1')
    .default(1),
  pageSize: z.coerce
    .number({
      invalid_type_error: 'El tamaño de página debe ser un número',
    })
    .int('El tamaño de página debe ser un número entero')
    .min(1, 'El tamaño de página debe ser mayor o igual a 1')
    .max(50, 'El tamaño de página debe ser como máximo 50')
    .default(10),
});

const rankingQuerySchema = z.object({
  limit: z.coerce
    .number({
      invalid_type_error: 'El límite debe ser un número',
    })
    .int('El límite debe ser un número entero')
    .min(1, 'El límite debe ser mayor o igual a 1')
    .max(50, 'El límite debe ser como máximo 50')
    .default(10),
});

const userIdParamSchema = z.object({
  id: z
    .string({
      required_error: 'Identificador de jugador inválido',
      invalid_type_error: 'Identificador de jugador inválido',
    })
    .uuid('Identificador de jugador inválido'),
});

module.exports = {
  avatarSelectionSchema,
  updateProfileSchema,
  paginationSchema,
  rankingQuerySchema,
  userIdParamSchema,
};
