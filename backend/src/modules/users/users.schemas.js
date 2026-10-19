const { z } = require('zod');

const avatarSelectionSchema = z.object({
  avatarId: z
    .string({
      required_error: 'Avatar inválido',
      invalid_type_error: 'Avatar inválido',
    })
    .uuid('Avatar inválido'),
});

module.exports = { avatarSelectionSchema };
