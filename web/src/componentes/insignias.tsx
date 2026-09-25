import type { EstadoFormulario, RolFormulario } from '@formalista/compartido';

const estilosEstado: Record<EstadoFormulario, { texto: string; clases: string }> = {
  borrador: { texto: 'Borrador', clases: 'bg-slate-100 text-slate-700 ring-slate-300' },
  publicado: { texto: 'Publicado', clases: 'bg-emerald-50 text-emerald-700 ring-emerald-300' },
  cerrado: { texto: 'Cerrado', clases: 'bg-amber-50 text-amber-800 ring-amber-300' },
};

export function InsigniaEstado({ estado }: { estado: EstadoFormulario }) {
  const { texto, clases } = estilosEstado[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${clases}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {texto}
    </span>
  );
}

/** Solo para formularios ajenos: "Compartido · Marketing · lector". */
export function InsigniaCompartido({ equipo, rol }: { equipo: string; rol: RolFormulario }) {
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 ring-inset">
      Compartido · {equipo} · {rol}
    </span>
  );
}
