import { puede } from '@formalista/compartido';
import { Link } from 'react-router';
import type { Resumen } from '../../api/formularios';
import { BotonCopiarLink } from '../../componentes/BotonCopiarLink';
import { InsigniaCompartido, InsigniaEstado } from '../../componentes/insignias';
import { haceTiempo } from '../../componentes/tiempo';
import { Boton, clasesBoton } from '../../componentes/ui';

/**
 * Un formulario de la lista. Los botones dependen del rol con la MISMA función `puede()` que
 * usa la API (paquete compartido). Ocultarlos es solo experiencia de uso: la API igual valida.
 */
export function FilaFormulario({ formulario, alEliminar }: { formulario: Resumen; alEliminar: () => void }) {
  const { id, titulo, estado, rol, equipo, cantidadPreguntas, actualizadoEn, slug } = formulario;

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate font-medium text-slate-900">{titulo}</h2>
          <InsigniaEstado estado={estado} />
          {rol !== 'propietario' && equipo && <InsigniaCompartido equipo={equipo.nombre} rol={rol} />}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {cantidadPreguntas === 1 ? '1 pregunta' : `${cantidadPreguntas} preguntas`} · Actualizado {haceTiempo(actualizadoEn)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" aria-label={`Acciones para ${titulo}`}>
        {puede(rol, 'editar') && (
          <Link to={`/formularios/${id}/editar`} className={clasesBoton('secundario', 'chico')}>
            Editar
          </Link>
        )}
        <Link to={`/formularios/${id}/resultados`} className={clasesBoton('secundario', 'chico')}>
          Resultados
        </Link>
        {estado === 'publicado' && <BotonCopiarLink slug={slug} />}
        {puede(rol, 'eliminar') && (
          <Boton variante="secundario" tamano="chico" className="text-red-700" onClick={alEliminar}>
            Eliminar
          </Boton>
        )}
      </div>
    </li>
  );
}
