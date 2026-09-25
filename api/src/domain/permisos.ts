export type RolEquipo = 'propietario' | 'editor' | 'lector';
export const ROLES_EQUIPO: readonly RolEquipo[] = ['propietario', 'editor', 'lector'];

export type RolFormulario = 'propietario' | 'editor' | 'lector';

export type AccionFormulario = 'ver' | 'verResultados' | 'editar' | 'cambiarEstado' | 'eliminar' | 'compartir';

/** Qué puede hacer cada rol sobre un formulario. */
const PERMISOS: Record<RolFormulario, readonly AccionFormulario[]> = {
  propietario: ['ver', 'verResultados', 'editar', 'cambiarEstado', 'eliminar', 'compartir'],
  editor: ['ver', 'verResultados', 'editar', 'cambiarEstado'],
  lector: ['ver', 'verResultados'],
};

/** Para mensajes: "Tu rol (lector) no permite editar este formulario". */
export const DESCRIPCION_ACCION: Record<AccionFormulario, string> = {
  ver: 'ver',
  verResultados: 'ver los resultados de',
  editar: 'editar',
  cambiarEstado: 'publicar o cerrar',
  eliminar: 'eliminar',
  compartir: 'compartir',
};

/**
 * Rol efectivo de un usuario sobre un formulario:
 * - Quien lo creó es su propietario.
 * - Un miembro del equipo con el que está compartido: propietario o editor del equipo → editor;
 *   lector del equipo → lector. El propietario del EQUIPO no puede borrar ni compartir formularios
 *   ajenos: esas acciones destructivas quedan solo para quien creó el formulario.
 * - Cualquier otro: sin acceso (null).
 */
export function rolEnFormulario(esPropietario: boolean, rolEquipo: RolEquipo | null): RolFormulario | null {
  if (esPropietario) return 'propietario';
  if (rolEquipo === 'lector') return 'lector';
  if (rolEquipo === 'propietario' || rolEquipo === 'editor') return 'editor';
  return null;
}

export function puede(rol: RolFormulario, accion: AccionFormulario): boolean {
  return PERMISOS[rol].includes(accion);
}

// ---------------------------------------------------------------------------
// Equipos
// ---------------------------------------------------------------------------

export interface MiembroActual {
  usuarioId: number;
  rol: RolEquipo;
}

export interface CambioMiembroInvalido {
  motivo: 'no_miembro' | 'ultimo_propietario';
  mensaje: string;
}

/**
 * Valida cambiar el rol de un miembro (nuevoRol) o quitarlo (nuevoRol = null), a partir de los
 * miembros actuales. Regla: un equipo siempre conserva al menos un propietario.
 */
export function validarCambioDeMiembro(
  miembros: MiembroActual[],
  usuarioId: number,
  nuevoRol: RolEquipo | null,
): CambioMiembroInvalido | null {
  const miembro = miembros.find((m) => m.usuarioId === usuarioId);
  if (!miembro) return { motivo: 'no_miembro', mensaje: 'El usuario no es miembro del equipo' };

  const dejaDeSerPropietario = miembro.rol === 'propietario' && nuevoRol !== 'propietario';
  const propietarios = miembros.filter((m) => m.rol === 'propietario').length;
  if (dejaDeSerPropietario && propietarios === 1) {
    return {
      motivo: 'ultimo_propietario',
      mensaje: 'El equipo debe conservar al menos un propietario: asigna otro propietario antes',
    };
  }
  return null;
}
