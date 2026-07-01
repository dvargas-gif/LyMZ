import * as XLSX from 'xlsx';

/** Exporta un array de objetos plano a un .xlsx, mismo patrón que ya usaba el mapa legacy. */
export function exportarExcel(filas, nombreArchivo, nombreHoja = 'Datos') {
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  XLSX.writeFile(wb, nombreArchivo);
}
