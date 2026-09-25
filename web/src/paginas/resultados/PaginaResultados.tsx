import { puede, type SeleccionVersion } from '@formalista/compartido';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { apiFormularios, clavesFormularios, type Detalle } from '../../api/formularios';
import { apiResultados, clavesResultados, zonaDelNavegador } from '../../api/resultados';
import { Cargando } from '../../componentes/Cargando';
import { InsigniaEstado } from '../../componentes/insignias';
import { idPestana, Pestanas } from '../../componentes/Pestanas';
import { Alerta, Boton, clasesBoton } from '../../componentes/ui';
import { ListaRespuestas } from './ListaRespuestas';
import { Resumen } from './Resumen';

type Vista = 'resumen' | 'respuestas';

/** /formularios/:id/resultados — la ven todos los roles con acceso (acción verResultados). */
export function PaginaResultados() {
  const { id = '' } = useParams();
  const detalle = useQuery({ queryKey: clavesFormularios.detalle(id), queryFn: () => apiFormularios.obtener(id) });

  if (detalle.isPending) return <Cargando texto="Cargando resultados…" />;
  if (detalle.isError) {
    const noExiste = detalle.error instanceof ErrorApi && detalle.error.status === 404;
    return (
      <section className="space-y-4">
        <Alerta>{noExiste ? 'Formulario no encontrado.' : `No se pudo cargar el formulario: ${detalle.error.message}`}</Alerta>
        <Link to="/formularios" className={clasesBoton('secundario')}>
          Volver a mis formularios
        </Link>
      </section>
    );
  }
  return <Resultados detalle={detalle.data} />;
}

function Resultados({ detalle }: { detalle: Detalle }) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState<SeleccionVersion>('todas');
  const [vista, setVista] = useState<Vista>('resumen');
  // "Respuestas por día" se agrupa en los días de quien mira.
  const zona = zonaDelNavegador();

  const estadisticas = useQuery({
    queryKey: clavesResultados.estadisticas(detalle.id, version, zona),
    queryFn: () => apiResultados.estadisticas(detalle.id, version, zona),
  });

  // Botón en vez de actualización automática: cero llamadas de más.
  const actualizar = () => queryClient.invalidateQueries({ queryKey: clavesResultados.todo(detalle.id) });
  const versiones = Array.from({ length: detalle.version }, (_, i) => detalle.version - i);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Link to="/formularios" className="text-sm text-indigo-600 hover:underline">
          ← Mis formularios
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{detalle.titulo}</h1>
          <InsigniaEstado estado={detalle.estado} />
          {puede(detalle.rol, 'editar') && (
            <Link to={`/formularios/${detalle.id}/editar`} className={clasesBoton('secundario', 'chico')}>
              Editar
            </Link>
          )}
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="version" className="text-sm text-slate-600">
              Versión
            </label>
            <select
              id="version"
              value={version}
              onChange={(e) => setVersion(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm"
            >
              <option value="todas">Todas las versiones</option>
              {versiones.map((v) => (
                <option key={v} value={v}>
                  Versión {v}
                  {v === detalle.version ? ' (vigente)' : ''}
                </option>
              ))}
            </select>
            <Boton variante="secundario" onClick={actualizar} disabled={estadisticas.isFetching}>
              {estadisticas.isFetching ? 'Actualizando…' : 'Actualizar'}
            </Boton>
          </div>
        </div>
      </div>

      <Pestanas
        prefijo="resultados"
        etiqueta="Vista de resultados"
        activa={vista}
        alCambiar={setVista}
        pestanas={[
          { valor: 'resumen', texto: 'Resumen' },
          { valor: 'respuestas', texto: estadisticas.data ? `Respuestas (${estadisticas.data.total})` : 'Respuestas' },
        ]}
      />

      <div role="tabpanel" aria-labelledby={idPestana('resultados', vista)}>
        {vista === 'resumen' &&
          (estadisticas.isPending ? (
            <Cargando texto="Calculando resultados…" />
          ) : estadisticas.isError ? (
            <div className="space-y-3">
              <Alerta>No se pudieron calcular los resultados: {estadisticas.error.message}</Alerta>
              <Boton variante="secundario" onClick={() => estadisticas.refetch()}>
                Reintentar
              </Boton>
            </div>
          ) : (
            <Resumen resultados={estadisticas.data} detalle={detalle} alVerRespuestas={() => setVista('respuestas')} />
          ))}
        {/* key: al cambiar de versión, la lista vuelve a la página 1. */}
        {vista === 'respuestas' && <ListaRespuestas key={String(version)} formularioId={detalle.id} version={version} />}
      </div>
    </section>
  );
}
