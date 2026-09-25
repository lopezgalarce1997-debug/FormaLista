import type { ComponentProps, ReactNode } from 'react';

// Componentes base con Tailwind. Pocos y simples: el resto de la UI se arma con ellos.

type VarianteBoton = 'primario' | 'secundario' | 'peligro';

const estilosBoton: Record<VarianteBoton, string> = {
  primario: 'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-indigo-600',
  secundario: 'bg-white text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 focus-visible:outline-slate-400',
  peligro: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
};

export function Boton({
  variante = 'primario',
  className = '',
  ...props
}: ComponentProps<'button'> & { variante?: VarianteBoton }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${estilosBoton[variante]} ${className}`}
      {...props}
    />
  );
}

/**
 * Campo con etiqueta y mensaje de error accesibles: el error se asocia al input con
 * aria-describedby y el input se marca con aria-invalid (los lectores de pantalla lo anuncian).
 */
export function Campo({ etiqueta, error, id, ...props }: ComponentProps<'input'> & { etiqueta: string; id: string; error?: string }) {
  const idError = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-2 focus:outline-offset-0 ${
          error ? 'border-red-400 focus:outline-red-500' : 'border-slate-300 focus:outline-indigo-500'
        }`}
        {...props}
      />
      {error && (
        <p id={idError} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function Alerta({ children, tipo = 'error' }: { children: ReactNode; tipo?: 'error' | 'info' }) {
  const estilos = tipo === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-indigo-200 bg-indigo-50 text-indigo-800';
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-md border px-4 py-3 text-sm ${estilos}`}>
      {children}
    </div>
  );
}

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8 ${className}`}>{children}</div>;
}
