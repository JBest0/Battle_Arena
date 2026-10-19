import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

const TOKEN_KEY = 'token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [status, setStatus] = useState('loading');
  const statusRef = useRef('loading');

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const storeToken = useCallback((value) => {
    if (value) {
      sessionStorage.setItem(TOKEN_KEY, value);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
    setToken(value || null);
  }, []);

  const clearSession = useCallback(() => {
    storeToken(null);
    setUser(null);
    setStatus('anonymous');
  }, [storeToken]);

  useEffect(() => {
    let active = true;

    if (!sessionStorage.getItem(TOKEN_KEY)) {
      setStatus('anonymous');
      return undefined;
    }

    client
      .get('/auth/me')
      .then((response) => {
        if (!active) return;
        setUser(response.data.user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!active) return;
        clearSession();
      });

    return () => {
      active = false;
    };
  }, [clearSession]);

  useEffect(() => {
    function handleExpired(event) {
      const wasAuthenticated = statusRef.current === 'authenticated';
      clearSession();

      if (wasAuthenticated) {
        navigate('/login', {
          state: {
            message:
              event.detail || 'Tu sesión expiró. Inicia sesión de nuevo',
          },
        });
      }
    }

    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [clearSession, navigate]);

  const login = useCallback(
    async (identifier, password) => {
      const response = await client.post('/auth/login', {
        identifier,
        password,
      });

      storeToken(response.data.accessToken);
      setUser(response.data.user);
      setStatus('authenticated');

      return {
        user: response.data.user,
        notice: response.data.notice || null,
      };
    },
    [storeToken]
  );

  const logout = useCallback(async () => {
    try {
      await client.post('/auth/logout');
    } catch (err) {
      // El JWT no tiene estado en el servidor: la sesión se cierra igual.
    }
    clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const response = await client.get('/auth/me');
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const value = useMemo(
    () => ({ user, token, status, login, logout, logoutLocal: clearSession, refreshUser }),
    [user, token, status, login, logout, clearSession, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }

  return context;
}
