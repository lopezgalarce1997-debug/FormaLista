import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Diálogo modal sobre el elemento nativo <dialog>. showModal() ya resuelve lo difícil de la
 * accesibilidad: atrapa el foco dentro, lo devuelve al cerrar, cierra con Esc y deja el resto
 * de la página inerte (sin librerías).
 */
export function Dialogo({
  abierto,
  alCerrar,
  titulo,
  children,
}: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onClose={alCerrar} // Esc o dialog.close()
      onClick={(evento) => evento.target === ref.current && alCerrar()} // clic en el fondo oscuro
      className="m-auto w-full max-w-md rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="p-6">
        <h2 id={idTitulo} className="text-lg font-semibold text-slate-900">
          {titulo}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
