import type { RolEquipo } from '@formalista/compartido';

export const TEXTO_ROL: Record<RolEquipo, string> = {
  propietario: 'Propietario',
  editor: 'Editor',
  lector: 'Lector',
};

/** Qué puede hacer cada rol del EQUIPO (en los formularios compartidos con él y en el propio equipo). */
export const DESCRIPCION_ROL: Record<RolEquipo, string> = {
  propietario: 'Gestiona los miembros del equipo y edita los formularios compartidos con él.',
  editor: 'Edita y publica los formularios compartidos con el equipo.',
  lector: 'Ve los formularios compartidos con el equipo y sus resultados, sin editarlos.',
};
