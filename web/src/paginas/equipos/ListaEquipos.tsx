import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { apiEquipos, clavesEquipos } from '../../api/equipos';
import { Alerta, Boton } from '../../componentes/ui';
import { DialogoNuevoEquipo } from './DialogoNuevoEquipo';
import { TEXTO_ROL } from './roles';

/** /equipos — los equipos a los que pertenezco, con mi rol en cada uno. */
export function ListaEquipos() {
  const consulta = useQuery({ queryKey: clavesEquipos.lista, queryFn: apiEquipos.listar });
  const [creando, setCreando] = useState(false);
  // Al salir de un equipo, su página redirige aquí con el aviso.
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Equipos</h1>
        <Boton onClick={() => setCreando(true)}>+ Nuevo equipo</Boton>
      </div>

      {aviso && <Alerta tipo="info">{aviso}</Alerta>}

      {consulta.isPending && (
        <div role="status" aria-label="Cargando equipos" className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-16 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      )}

      {consulta.isError && (
        <div className="space-y-3">
          <Alerta>No se pudieron cargar los equipos: {consulta.error.message}</Alerta>
          <Boton variante="secundario" onClick={() => consulta.refetch()}>
            Reintentar
          </Boton>
        </div>
      )}

      {consulta.isSuccess && consulta.data.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-slate-300 px-6 py-12 text-center">
          <p className="font-medium text-slate-900">Aún no perteneces a ningún equipo</p>
          <p className="mt-1 text-sm text-slate-500">Crea uno para compartir formularios con otras personas.</p>
          <Boton className="mt-4" onClick={() => setCreando(true)}>
            Crear mi primer equipo
          </Boton>
        </div>
      )}

      {consulta.isSuccess && consulta.data.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          {consulta.data.map((equipo) => (
            <li key={equipo.id}>
              <Link
                to={`/equipos/${equipo.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <span className="font-medium text-slate-900">{equipo.nombre}</span>
                <span className="text-sm text-slate-500">
                  Tu rol: {TEXTO_ROL[equipo.rol]} · {equipo.cantidadMiembros}{' '}
                  {equipo.cantidadMiembros === 1 ? 'miembro' : 'miembros'}
                </span>
                <span className="ml-auto text-slate-400" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <DialogoNuevoEquipo abierto={creando} alCerrar={() => setCreando(false)} />
    </section>
  );
}
