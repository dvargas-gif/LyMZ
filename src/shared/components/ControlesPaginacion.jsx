/** Controles de paginación reutilizables (Anterior/Siguiente + "página X de Y" + total) -- puramente de presentación, el estado de página vive en quien lo usa. No se renderiza si hay una sola página (nada que paginar). */
export default function ControlesPaginacion({ pagina, totalPaginas, total, onCambiarPagina }) {
  if (totalPaginas <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 12.5 }}>
      <button className="btn-secondary" disabled={pagina <= 1} onClick={() => onCambiarPagina(pagina - 1)}>
        <i className="ti ti-chevron-left" /> Anterior
      </button>
      <span className="muted">Página {pagina} de {totalPaginas} ({total} registro{total === 1 ? '' : 's'})</span>
      <button className="btn-secondary" disabled={pagina >= totalPaginas} onClick={() => onCambiarPagina(pagina + 1)}>
        Siguiente <i className="ti ti-chevron-right" />
      </button>
    </div>
  );
}
