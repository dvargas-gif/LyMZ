import { useEffect, useState } from 'react';
import { escenariosService } from './escenarios.service.js';
import ListaSalas from './ListaSalas.jsx';
import SalaAbierta from './SalaAbierta.jsx';

/**
 * Orquesta lista de salas ↔ sala abierta. `salas`/`cargando` viven acá (no
 * dentro de ListaSalas) para sobrevivir el ida-y-vuelta a una sala: si
 * vivieran en el hijo, cada vuelta lo remontaría desde cero y se perdería
 * la lista ya cargada mientras se refresca. Todo lo demás (barra de
 * acciones, selección, panel abierto) es responsabilidad exclusiva de
 * SalaAbierta — no comparte ni un estado con la lista.
 */
export default function SalasView({ sesion }) {
  const [salas, setSalas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [salaAbierta, setSalaAbierta] = useState(null);

  async function cargar() {
    setCargando(true);
    setSalas(await escenariosService.listar());
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function crearSala(nombre) {
    const nueva = await escenariosService.crear({ nombre, usuarioId: sesion.usuarioId, usuarioNombre: sesion.nombre });
    await cargar();
    setSalaAbierta(nueva);
  }

  async function eliminarSala(sala) {
    if (!confirm(`¿Borrar la sala "${sala.nombre}"? Esto no se puede deshacer.`)) return;
    await escenariosService.eliminar(sala.id);
    await cargar();
  }

  function volverALaLista() {
    setSalaAbierta(null);
    cargar(); // refresca "última actualización" en la lista
  }

  if (salaAbierta) {
    return <SalaAbierta sala={salaAbierta} sesion={sesion} onAtras={volverALaLista} />;
  }

  return (
    <ListaSalas
      salas={salas}
      cargando={cargando}
      onCrear={crearSala}
      onAbrir={setSalaAbierta}
      onEliminar={eliminarSala}
    />
  );
}
