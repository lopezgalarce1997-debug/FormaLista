import type { ResultadosDeFormulario } from '../../api/resultados';
import type { Detalle } from '../../api/formularios';
import { BotonCopiarLink } from '../../componentes/BotonCopiarLink';
import { formatoFecha } from '../../componentes/formato';
import { GraficoBarras, GraficoConTabla } from '../../componentes/GraficoConTabla';
import { EstadisticaPregunta } from './EstadisticaPregunta';

export function Resumen({
  resultados: r,
  detalle,
  alVerRespuestas,
}: {
  resultados: ResultadosDeFormulario;
  detalle: Detalle;
  alVerRespuestas: () => void;
}) {
  if (r.total === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-300 px-6 py-12 text-center">
        <p className="font-medium text-slate-900">{r.version === 'todas' ? 'Aún no hay respuestas' : `No hay respuestas para la versión ${r.version}`}</p>
        {detalle.estado === 'publicado' ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-500">Comparte el link para empezar a recibirlas.</p>
            <BotonCopiarLink slug={detalle.slug} tamano="normal" />
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Publica el formulario para empezar a recibir respuestas.</p>
        )}
      </div>
    );
  }

  const ultimoDia = [...r.porDia].reverse().find((d) => d.cantidad > 0)?.dia;
  const porDia = r.porDia.map((d) => ({ etiqueta: formatoFecha(d.dia), valor: d.cantidad }));

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-3">
        <Indicador etiqueta="respuestas" valor={String(r.total)} />
        <Indicador etiqueta={r.porVersion.length === 1 ? 'versión con respuestas' : 'versiones con respuestas'} valor={String(r.porVersion.length)} />
        <Indicador etiqueta="última respuesta" valor={ultimoDia ? formatoFecha(ultimoDia) : '—'} />
      </dl>

      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <GraficoConTabla titulo="Respuestas por día" columnas={['Día', 'Respuestas']} datos={porDia}>
          <GraficoBarras datos={porDia} nombreSerie="Respuestas" />
        </GraficoConTabla>
      </div>

      <section aria-label="Resultados por pregunta" className="space-y-4">
        {r.preguntas.map((e) => (
          <EstadisticaPregunta key={e.id} estadistica={e} combinada={r.version === 'todas'} alVerRespuestas={alVerRespuestas} />
        ))}
      </section>

      {r.preguntasAnteriores.length > 0 && (
        <details className="rounded-xl bg-slate-100 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Preguntas de versiones anteriores ({r.preguntasAnteriores.length})
          </summary>
          <div className="mt-4 space-y-4">
            {r.preguntasAnteriores.map((e) => (
              <EstadisticaPregunta key={e.id} estadistica={e} combinada alVerRespuestas={alVerRespuestas} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Indicador({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col-reverse rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <dt className="text-sm text-slate-500">{etiqueta}</dt>
      <dd className="text-2xl font-semibold text-slate-900 tabular-nums">{valor}</dd>
    </div>
  );
}
