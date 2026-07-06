import { Component } from 'react';

/**
 * Red de contención para las zonas con React.lazy/Suspense: si un chunk no
 * carga (red inestable, o un deploy nuevo invalidó un chunk viejo que el
 * navegador tenía cacheado) o el componente lanza un error de render, esto
 * evita una pantalla en blanco sin explicación — muestra un aviso con la
 * opción de recargar. No reporta nada a Supabase: es un error de carga del
 * propio frontend, no un evento de negocio (eso ya lo cubre auditoria).
 *
 * Tiene que ser class component: es el único mecanismo de React para esto
 * (getDerivedStateFromError/componentDidCatch no tienen equivalente en hooks).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <i className="ti ti-alert-triangle" />
          <p>{this.props.mensaje || 'Algo no cargó bien.'}</p>
          <button className="btn-secondary" onClick={() => window.location.reload()}>
            <i className="ti ti-refresh" /> Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
