import {
  DESCRIPCION_ACCION,
  puede,
  rolEnFormulario,
  type AccionFormulario,
  type RolFormulario,
} from '../domain/permisos.js';
import { ErrorAplicacion } from './errores.js';
import type { AccesoFormulario, RepositorioRegistroFormularios } from './puertos.js';

export type AccesoAutorizado = AccesoFormulario & { rol: RolFormulario };

/**
 * Verifica que el usuario pueda realizar `accion` sobre el formulario (como [Authorize(Policy)]
 * en ASP.NET Core, pero con el recurso concreto):
 * - Sin ningún acceso (no existe, no es propietario ni miembro del equipo) → 404: no se revela que existe.
 * - Con acceso, pero su rol no permite la acción → 403 con un mensaje claro.
 */
export async function autorizar(
  registro: RepositorioRegistroFormularios,
  usuarioId: number,
  formularioId: string,
  accion: AccionFormulario,
): Promise<AccesoAutorizado> {
  const acceso = await registro.buscarAcceso(formularioId, usuarioId);
  const rol = acceso ? rolEnFormulario(acceso.esPropietario, acceso.rolEquipo) : null;
  if (!acceso || !rol) throw formularioNoEncontrado();

  if (!puede(rol, accion)) {
    throw new ErrorAplicacion('prohibido', `Tu rol (${rol}) no permite ${DESCRIPCION_ACCION[accion]} este formulario`);
  }
  return { ...acceso, rol };
}

export function formularioNoEncontrado(): ErrorAplicacion {
  return new ErrorAplicacion('no_encontrado', 'Formulario no encontrado');
}
