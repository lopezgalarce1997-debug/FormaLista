import type { SeleccionVersion } from '@formalista/compartido';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiResultados, clavesResultados, type PaginaDeRespuestas } from '../../api/resultados';
import { Cargando } from '../../componentes/Cargando';
import { formatoFecha, formatoFechaHora } from '../../componentes/formato';
import { Alerta, Boton } from '../../componentes/ui';

type Item = PaginaDeRespuestas['respuestas'][number]['respuestas'][number];

/** Respuestas individuales, paginadas en el servidor (20 por página, más recientes primero). */
export function ListaRespuestas({ formularioId, version }: { formularioId: string; version: SeleccionVersion }) {
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({
    queryKey: clavesResultados.respuestas(formularioId, version, pagina),
    queryFn: () => apiResultados.respuestas(formularioId, version, pagina),
    // Mientras llega la página nueva se sigue mostrando la anterior: la lista no parpadea.
    placeholderData: keepPreviousData,
  });

  if (consulta.isPending) return <Cargando texto="Cargando respuestas…" />;
  if (consulta.isError) {
    return (
      <div className="space-y-3">
        <Alerta>No se pudieron cargar las respuestas: {consulta.error.message}</Alerta>
        <Boton variante="secundario" onClick={() => consulta.refetch()}>
          Reintentar
        </Boton>
      </div>
    );
  }

  const { respuestas, total, totalPaginas } = consulta.data;
  if (total === 0) return <p className="py-8 text-center text-sm text-slate-500">Aún no hay respuestas.</p>;

  return (
    <div className="space-y-4">
      <ol className={`space-y-4 ${consulta.isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={consulta.isPlaceholderData}>
        {respuestas.map((r) => (
          <li key={r.id} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">
              {formatoFechaHora(r.enviadaEn)} · versión {r.version}
            </p>
            <dl className="mt-3 space-y-3">
              {r.respuestas.map((item) => (
                <div key={item.preguntaId}>
                  {/* El texto de la pregunta es el de SU versión (lo resuelve la API). */}
                  <dt className="text-sm font-medium text-slate-700">{item.pregunta ?? '(pregunta desconocida)'}</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-900">{mostrarValor(item)}</dd>
                </div>
              ))}
              {r.respuestas.length === 0 && <p className="text-sm text-slate-500">(Respondió sin completar preguntas opcionales)</p>}
            </dl>
          </li>
        ))}
      </ol>

      <nav aria-label="Paginación de respuestas" className="flex items-center justify-between gap-2">
        <Boton variante="secundario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
          ← Anterior
        </Boton>
        <p className="text-sm text-slate-600" aria-live="polite">
          Página {pagina} de {totalPaginas} · {total} respuestas
        </p>
        <Boton variante="secundario" disabled={pagina >= totalPaginas || consulta.isPlaceholderData} onClick={() => setPagina((p) => p + 1)}>
          Siguiente →
        </Boton>
      </nav>
    </div>
  );
}

function mostrarValor({ tipo, valor }: Item): string {
  if (Array.isArray(valor)) return valor.join(', ');
  if (tipo === 'fecha' && typeof valor === 'string') return formatoFecha(valor);
  return String(valor);
}
