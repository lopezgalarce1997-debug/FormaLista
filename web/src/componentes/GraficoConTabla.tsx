import { useId, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface Dato {
  etiqueta: string;
  valor: number;
}

/**
 * Un gráfico + la tabla con los mismos datos. El SVG de Recharts no lo puede leer un lector de
 * pantalla, así que se oculta para ellos (aria-hidden) y la tabla es la versión accesible: siempre
 * está en el DOM (oculta a la vista) y el botón "Ver como tabla" la muestra.
 */
export function GraficoConTabla({ titulo, columnas, datos, children }: { titulo: string; columnas: [string, string]; datos: Dato[]; children: ReactNode }) {
  const [verTabla, setVerTabla] = useState(false);
  const idTabla = useId();

  return (
    <figure className="space-y-2">
      <figcaption className="flex items-center justify-between gap-2 text-sm font-medium text-slate-700">
        {titulo}
        <button
          type="button"
          className="text-xs font-medium text-indigo-600 hover:underline"
          aria-expanded={verTabla}
          aria-controls={idTabla}
          onClick={() => setVerTabla((v) => !v)}
        >
          {verTabla ? 'Ocultar tabla' : 'Ver como tabla'}
        </button>
      </figcaption>
      <div aria-hidden="true" className="h-48">
        {children}
      </div>
      <table id={idTabla} className={verTabla ? 'w-full text-left text-sm' : 'sr-only'}>
        <caption className="sr-only">{titulo}</caption>
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th scope="col" className="py-1 font-medium">
              {columnas[0]}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {columnas[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {datos.map((d) => (
            <tr key={d.etiqueta} className="border-b border-slate-100">
              <th scope="row" className="py-1 font-normal">
                {d.etiqueta}
              </th>
              <td className="py-1 text-right tabular-nums">{d.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Barras verticales simples (respuestas por día, distribución de una escala). */
export function GraficoBarras({ datos, nombreSerie }: { datos: Dato[]; nombreSerie: string }) {
  return (
    // initialDimension: tamaño inicial antes de medir el contenedor (evita un primer render de 0×0).
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 192 }}>
      <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="etiqueta" tick={{ fontSize: 12 }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: '#eef2ff' }} />
        <Bar dataKey="valor" name={nombreSerie} fill="#4f46e5" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
