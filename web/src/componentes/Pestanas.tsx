import type { KeyboardEvent, ReactNode } from 'react';

export interface Pestana<T extends string> {
  valor: T;
  texto: ReactNode;
}

/** id de la pestaña: el panel correspondiente lo usa en aria-labelledby. */
export const idPestana = (prefijo: string, valor: string) => `${prefijo}-${valor}`;

/**
 * Pestañas con el patrón accesible de WAI-ARIA: role tablist/tab, aria-selected y flechas ← →
 * para moverse entre ellas (con Tab se sale del grupo, no se recorre cada pestaña).
 * Cada panel debe llevar role="tabpanel" y aria-labelledby={idPestana(prefijo, valor)}.
 */
export function Pestanas<T extends string>({
  prefijo,
  pestanas,
  activa,
  alCambiar,
  etiqueta,
}: {
  prefijo: string;
  pestanas: Pestana<T>[];
  activa: T;
  alCambiar: (valor: T) => void;
  etiqueta: string;
}) {
  const alTeclear = (evento: KeyboardEvent) => {
    if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return;
    const actual = pestanas.findIndex((p) => p.valor === activa);
    const paso = evento.key === 'ArrowRight' ? 1 : -1;
    const siguiente = pestanas[(actual + paso + pestanas.length) % pestanas.length]!.valor;
    alCambiar(siguiente);
    document.getElementById(idPestana(prefijo, siguiente))?.focus();
  };

  return (
    <div role="tablist" aria-label={etiqueta} className="inline-flex rounded-lg bg-slate-100 p-1" onKeyDown={alTeclear}>
      {pestanas.map(({ valor, texto }) => (
        <button
          key={valor}
          id={idPestana(prefijo, valor)}
          type="button"
          role="tab"
          aria-selected={activa === valor}
          tabIndex={activa === valor ? 0 : -1}
          onClick={() => alCambiar(valor)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            activa === valor ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}
