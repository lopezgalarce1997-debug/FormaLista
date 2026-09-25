import type { Estadistica } from '../../api/resultados';
import { formatoFecha, formatoFechaHora, formatoNumero, porcentaje } from '../../componentes/formato';
import { GraficoBarras, GraficoConTabla } from '../../componentes/GraficoConTabla';
import { NOMBRE_TIPO } from '../../componentes/tiposPregunta';
import { Alerta } from '../../componentes/ui';

/** La estadística de una pregunta, según su tipo. */
export function EstadisticaPregunta({
  estadistica: e,
  combinada,
  alVerRespuestas,
}: {
  estadistica: Estadistica;
  /** true en "todas las versiones": se indica en qué versiones existía la pregunta. */
  combinada: boolean;
  alVerRespuestas: () => void;
}) {
  const detalles = [
    NOMBRE_TIPO[e.tipo],
    `respondieron ${e.respondieron} de ${e.posibles} (${porcentaje(e.respondieron, e.posibles)} %)`,
    ...(combinada && e.versiones.length > 1 ? [`versiones ${e.versiones.join(', ')}`] : []),
  ];

  return (
    <article className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-labelledby={`estadistica-${e.id}`}>
      <header>
        <h3 id={`estadistica-${e.id}`} className="font-semibold text-slate-900">
          {e.texto}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {detalles.join(' · ')}
          {e.textoCambio && ' · el texto de la pregunta cambió entre versiones'}
        </p>
      </header>
      <Contenido e={e} alVerRespuestas={alVerRespuestas} />
    </article>
  );
}

function Contenido({ e, alVerRespuestas }: { e: Estadistica; alVerRespuestas: () => void }) {
  switch (e.tipo) {
    case 'opcion_unica':
    case 'opcion_multiple':
      return (
        <>
          {/* Barras HTML (no un gráfico): el texto se lee, se copia y se imprime; los % son sobre quienes respondieron. */}
          <ul className="space-y-2">
            {e.opciones.map((o) => {
              const pct = porcentaje(o.cantidad, e.respondieron);
              return (
                <li key={o.valor}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className={o.yaNoExiste ? 'text-slate-500' : 'text-slate-800'}>
                      {o.valor}
                      {o.yaNoExiste && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">ya no existe</span>}
                    </span>
                    <span className="tabular-nums text-slate-600">
                      {o.cantidad} ({pct} %)
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100" aria-hidden="true">
                    <div className={`h-2 rounded-full ${o.yaNoExiste ? 'bg-slate-400' : 'bg-indigo-600'}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {e.tipo === 'opcion_multiple' && (
            <p className="text-xs text-slate-500">Cada persona pudo elegir varias opciones: los porcentajes no suman 100.</p>
          )}
        </>
      );

    case 'escala':
      return (
        <div className="space-y-3">
          <p>
            <span className="text-3xl font-semibold text-slate-900">{e.promedio === null ? '—' : formatoNumero(e.promedio)}</span>
            <span className="ml-2 text-sm text-slate-500">
              promedio (escala {e.minimo} a {e.maximo})
            </span>
          </p>
          {e.advertencia && <Alerta tipo="info">{e.advertencia}</Alerta>}
          <GraficoConTabla
            titulo={`Distribución de «${e.texto}»`}
            columnas={['Valor', 'Respuestas']}
            datos={e.distribucion.map((d) => ({ etiqueta: String(d.valor), valor: d.cantidad }))}
          >
            <GraficoBarras datos={e.distribucion.map((d) => ({ etiqueta: String(d.valor), valor: d.cantidad }))} nombreSerie="Respuestas" />
          </GraficoConTabla>
        </div>
      );

    case 'fecha':
      return e.primera && e.ultima ? (
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">Primera fecha respondida</dt>
            <dd className="font-medium text-slate-900">{formatoFecha(e.primera)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Última fecha respondida</dt>
            <dd className="font-medium text-slate-900">{formatoFecha(e.ultima)}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-slate-500">Sin respuestas todavía.</p>
      );

    case 'texto_corto':
    case 'texto_largo':
      return e.ultimos.length === 0 ? (
        <p className="text-sm text-slate-500">Sin respuestas todavía.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase">Últimas respuestas</p>
          <ul className="space-y-2">
            {e.ultimos.map((u, i) => (
              <li key={i} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                <p className="whitespace-pre-line text-slate-800">{u.valor}</p>
                <p className="mt-1 text-xs text-slate-500">{formatoFechaHora(u.enviadaEn)}</p>
              </li>
            ))}
          </ul>
          <button type="button" className="text-sm font-medium text-indigo-600 hover:underline" onClick={alVerRespuestas}>
            Ver todas en Respuestas →
          </button>
        </div>
      );
  }
}
