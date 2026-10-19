import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <p className="status" role="status">
        Cargando sesión…
      </p>
    );
  }

  if (status === 'anonymous') {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
          message: 'Inicia sesión para continuar',
        }}
      />
    );
  }

  return <Outlet />;
}
