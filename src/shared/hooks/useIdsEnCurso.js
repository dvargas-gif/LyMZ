import { useCallback, useState } from 'react';

/**
 * Guarda qué IDs tienen una acción async en curso -- evita que un
 * doble-click dispare dos llamadas concurrentes para el mismo ítem (misma
 * lectura de estado, dos registros de auditoría/Terminal duplicados para
 * una sola acción real). Antes este mismo patrón (Set + add-antes-del-await
 * + delete-en-finally) estaba copiado idéntico en FlujoMigracionSlot.jsx y
 * PanelBufferGlobal.jsx para su botón "Devolver" -- un solo hook, un solo
 * lugar para el bugfix si alguna vez hace falta.
 */
export function useIdsEnCurso() {
  const [idsEnCurso, setIdsEnCurso] = useState(new Set());

  const ejecutar = useCallback(async (id, accionAsync) => {
    setIdsEnCurso(actuales => new Set(actuales).add(id));
    try {
      await accionAsync();
    } finally {
      setIdsEnCurso(actuales => { const s = new Set(actuales); s.delete(id); return s; });
    }
  }, []);

  return { idsEnCurso, ejecutar };
}
