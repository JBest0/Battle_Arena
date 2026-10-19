export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

export const EMAIL_NOT_VERIFIED_MESSAGE =
  'Debes verificar tu correo antes de iniciar una partida';

export function getErrorCode(err) {
  return err?.response?.data?.error?.code || null;
}

export function isEmailNotVerified(err) {
  return getErrorCode(err) === EMAIL_NOT_VERIFIED;
}
