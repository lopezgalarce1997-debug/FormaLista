import { ROLES_EQUIPO, type RolEquipo } from '@formalista/compartido';
import type { Equipo } from '../../api/equipos';
import { Boton } from '../../componentes/ui';
import { TEXTO_ROL } from './roles';

type Miembro = Equipo['miembros'][number];

interface Props {
  miembro: Miembro;
  esYo: boolean;
  /** Quien mira es propietario: puede cambiar roles y quitar a otros. */
  gestiona: boolean;
  /** El rol que se muestra: el guardado o, mientras se guarda, el elegido. */
  rolMostrado: RolEquipo;
  ocupado: boolean;
  /** id del texto que explica por qué esta persona no puede dejar de ser propietaria (o null). */
  idBloqueoUltimoPropietario: string | null;
  alCambiarRol: (rol: RolEquipo) => void;
  alQuitar: () => void;
}

export function FilaMiembro({ miembro, esYo, gestiona, rolMostrado, ocupado, idBloqueoUltimoPropietario, alCambiarRol, alQuitar }: Props) {
  const idSelect = `rol-${miembro.usuarioId}`;
  const bloqueado = idBloqueoUltimoPropietario !== null;

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">
          {miembro.nombre}
          {esYo && <span className="font-normal text-slate-500"> (tú)</span>}
        </p>
        <p className="truncate text-sm text-slate-500">{miembro.email}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {gestiona ? (
          <>
            <label htmlFor={idSelect} className="sr-only">
              Rol de {miembro.nombre}
            </label>
            <select
              id={idSelect}
              value={rolMostrado}
              disabled={ocupado}
              aria-describedby={idBloqueoUltimoPropietario ?? undefined}
              onChange={(e) => alCambiarRol(e.target.value as RolEquipo)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm disabled:opacity-60"
            >
              {ROLES_EQUIPO.map((rol) => (
                // Al único propietario solo le queda "Propietario": la misma regla que valida la API.
                <option key={rol} value={rol} disabled={bloqueado && rol !== 'propietario'}>
                  {TEXTO_ROL[rol]}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="text-sm text-slate-700">{TEXTO_ROL[miembro.rol]}</span>
        )}

        {esYo ? (
          <Boton
            variante="secundario"
            tamano="chico"
            disabled={ocupado || bloqueado}
            aria-describedby={idBloqueoUltimoPropietario ?? undefined}
            onClick={alQuitar}
          >
            Salir del equipo
          </Boton>
        ) : (
          gestiona && (
            // aria-label: hay un "Quitar" por fila; el nombre accesible dice a quién (e incluye el texto visible).
            <Boton
              variante="secundario"
              tamano="chico"
              className="text-red-700"
              aria-label={`Quitar a ${miembro.nombre}`}
              disabled={ocupado}
              onClick={alQuitar}
            >
              Quitar
            </Boton>
          )
        )}
      </div>
    </li>
  );
}
