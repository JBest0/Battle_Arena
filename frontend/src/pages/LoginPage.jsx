import { Link } from 'react-router-dom';

export default function LoginPage() {
  return (
    <section className="card form-card">
      <h2>Iniciar sesión</h2>
      <p>El inicio de sesión estará disponible en la historia US-02.</p>
      <Link className="button" to="/register">
        Crear cuenta
      </Link>
    </section>
  );
}
