import { Link } from 'react-router-dom';

export default function ForgotPasswordPage() {
  return (
    <section className="card form-card">
      <h2>Recuperar contraseña</h2>
      <p>Disponible pronto.</p>
      <Link to="/login">Volver a iniciar sesión</Link>
    </section>
  );
}
