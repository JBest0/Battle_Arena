const { z } = require('zod');

const DEFAULT_RANKING_PAGE_SIZE = 20;
const MAX_RANKING_PAGE_SIZE = 100;

// `limit` es el parámetro heredado (top N). `page`/`pageSize` activan la
// paginación. No se pueden combinar en la misma petición.
const rankingQuerySchema = z
  .object({
    limit: z.coerce
      .number({
        invalid_type_error: 'El límite debe ser un número',
      })
      .int('El límite debe ser un número entero')
      .min(1, 'El límite debe ser mayor o igual a 1')
      .max(50, 'El límite debe ser como máximo 50')
      .optional(),
    page: z.coerce
      .number({
        invalid_type_error: 'La página debe ser un número',
      })
      .int('La página debe ser un número entero')
      .min(1, 'La página debe ser mayor o igual a 1')
      .optional(),
    pageSize: z.coerce
      .number({
        invalid_type_error: 'El tamaño de página debe ser un número',
      })
      .int('El tamaño de página debe ser un número entero')
      .min(1, 'El tamaño de página debe ser mayor o igual a 1')
      .max(
        MAX_RANKING_PAGE_SIZE,
        `El tamaño de página debe ser como máximo ${MAX_RANKING_PAGE_SIZE}`
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.limit !== undefined &&
      (data.page !== undefined || data.pageSize !== undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limit'],
        message: 'No se puede combinar limit con page o pageSize',
      });
    }
  })
  .transform((data) => {
    if (data.page !== undefined || data.pageSize !== undefined) {
      return {
        page: data.page ?? 1,
        pageSize: data.pageSize ?? DEFAULT_RANKING_PAGE_SIZE,
      };
    }

    return { limit: data.limit ?? 10 };
  });

module.exports = {
  rankingQuerySchema,
  DEFAULT_RANKING_PAGE_SIZE,
  MAX_RANKING_PAGE_SIZE,
};
