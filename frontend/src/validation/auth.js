const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LETTER_PATTERN = /[a-zA-Z]/;
const NUMBER_PATTERN = /[0-9]/;

export const PASSWORD_HELP = [
  'Mínimo 8 caracteres (máximo 72).',
  'Al menos una letra.',
  'Al menos un número.',
];

export function validateUsername(value) {
  const username = value.trim();
  if (!username) return 'El nombre de usuario es obligatorio';
  if (username.length < 3)
    return 'El nombre de usuario debe tener al menos 3 caracteres';
  if (username.length > 30)
    return 'El nombre de usuario debe tener como máximo 30 caracteres';
  if (!USERNAME_PATTERN.test(username))
    return 'El nombre de usuario solo puede contener letras, números y guion bajo';
  return '';
}

export function validateEmail(value) {
  const email = value.trim();
  if (!email) return 'El correo es obligatorio';
  if (!EMAIL_PATTERN.test(email)) return 'El formato del correo no es válido';
  return '';
}

export function validatePassword(value) {
  if (!value) return 'La contraseña es obligatoria';
  if (value.length < 8)
    return 'La contraseña debe tener al menos 8 caracteres';
  if (value.length > 72)
    return 'La contraseña debe tener como máximo 72 caracteres';
  if (!LETTER_PATTERN.test(value))
    return 'La contraseña debe contener al menos una letra';
  if (!NUMBER_PATTERN.test(value))
    return 'La contraseña debe contener al menos un número';
  return '';
}

export function validateRegister(values) {
  const errors = {};

  const usernameError = validateUsername(values.username);
  if (usernameError) errors.username = usernameError;

  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;

  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Confirme la contraseña';
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Las contraseñas no coinciden';
  }

  return errors;
}

export function validatePasswordReset(values) {
  const errors = {};

  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Confirme la contraseña';
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Las contraseñas no coinciden';
  }

  return errors;
}

export function validateProfileInfo(values) {
  const errors = {};

  if (values.displayName.trim().length > 40) {
    errors.displayName =
      'El nombre visible debe tener como máximo 40 caracteres';
  }

  if (values.bio.trim().length > 200) {
    errors.bio = 'La biografía debe tener como máximo 200 caracteres';
  }

  return errors;
}
