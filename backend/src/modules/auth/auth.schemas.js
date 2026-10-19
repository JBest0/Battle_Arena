const { z } = require('zod');

const passwordRules = z
  .string({
    required_error: 'La contraseña es obligatoria',
    invalid_type_error: 'La contraseña es obligatoria',
  })
  .min(1, 'La contraseña es obligatoria')
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña debe tener como máximo 72 caracteres')
  .regex(/[a-zA-Z]/, 'La contraseña debe contener al menos una letra')
  .regex(/[0-9]/, 'La contraseña debe contener al menos un número');

const usernameRules = z
  .string({
    required_error: 'El nombre de usuario es obligatorio',
    invalid_type_error: 'El nombre de usuario es obligatorio',
  })
  .trim()
  .min(1, 'El nombre de usuario es obligatorio')
  .min(3, 'El nombre de usuario debe tener al menos 3 caracteres')
  .max(30, 'El nombre de usuario debe tener como máximo 30 caracteres')
  .regex(
    /^[a-zA-Z0-9_]+$/,
    'El nombre de usuario solo puede contener letras, números y guion bajo'
  );

const emailRules = z
  .string({
    required_error: 'El correo es obligatorio',
    invalid_type_error: 'El correo es obligatorio',
  })
  .trim()
  .toLowerCase()
  .min(1, 'El correo es obligatorio')
  .email('El formato del correo no es válido');

const registerSchema = z
  .object({
    username: usernameRules,
    email: emailRules,
    password: passwordRules,
    confirmPassword: z
      .string({
        required_error: 'Confirme la contraseña',
        invalid_type_error: 'Confirme la contraseña',
      })
      .min(1, 'Confirme la contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  });

const loginSchema = z.object({
  identifier: z.string().min(1, 'El identificador es obligatorio'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

module.exports = {
  passwordRules,
  usernameRules,
  emailRules,
  registerSchema,
  loginSchema,
};
