import type { ReactNode } from 'react';

/** Marco de las páginas públicas: sin la barra de la app. */
export function MarcoPublico({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">{children}</main>
      <footer className="py-6 text-center text-xs text-slate-400">Hecho con FormaLista</footer>
    </div>
  );
}

/** Mensaje de página completa: formulario no disponible, cerrado, etc. */
export function Aviso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
      <h1 className="text-xl font-semibold text-slate-900">{titulo}</h1>
      <p className="mt-2 text-slate-600">{children}</p>
    </div>
  );
}
