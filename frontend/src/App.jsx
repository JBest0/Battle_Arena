import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './auth/ProtectedRoute';
import VerifiedRoute from './auth/VerifiedRoute';
import HomePage from './pages/HomePage';
import RegisterPage from './pages/RegisterPage';
import CheckEmailPage from './pages/CheckEmailPage';
import LoginPage from './pages/LoginPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ProfilePage from './pages/ProfilePage';
import LobbyPage from './pages/LobbyPage';
import ArenaPage from './pages/ArenaPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="check-email" element={<CheckEmailPage />} />
        <Route path="verify" element={<VerifyEmailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="profile" element={<ProfilePage />} />

          <Route element={<VerifiedRoute />}>
            <Route path="lobby" element={<LobbyPage />} />
            <Route path="arena" element={<ArenaPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
