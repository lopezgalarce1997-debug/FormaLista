import type { ReactNode } from 'react';
import { Tarjeta } from '../../componentes/ui';

/** Marco común de login y registro: logo, título y una tarjeta centrada. */
export function PantallaAuth({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <p className="mb-8 text-2xl font-bold tracking-tight text-indigo-600">FormaLista</p>
      <Tarjeta className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-slate-900">{titulo}</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">{subtitulo}</p>
        {children}
      </Tarjeta>
    </main>
  );
}
