import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function VerifiedRoute() {
  const { user } = useAuth();

  if (!user || !user.emailVerified) {
    return (
      <Navigate
        to="/profile"
        replace
        state={{
          notice: {
            code: 'EMAIL_NOT_VERIFIED',
            message:
              'Debes verificar tu correo antes de entrar al área de juego.',
          },
        }}
      />
    );
  }

  return <Outlet />;
}
