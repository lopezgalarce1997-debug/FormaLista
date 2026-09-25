import { ErrorAplicacion } from './errores.js';
import type { RegistroFormulario, RepositorioRegistroFormularios } from './puertos.js';

/**
 * Devuelve el registro del formulario si el usuario tiene acceso; si no, 404.
 * 404 y no 403: no se revela que existe un formulario ajeno con ese id.
 * Por ahora solo el propietario tiene acceso (los roles de equipo llegan en el paso 10).
 */
export async function registroAccesible(
  registro: RepositorioRegistroFormularios,
  usuarioId: number,
  formularioId: string,
): Promise<RegistroFormulario> {
  const encontrado = await registro.buscar(formularioId);
  if (!encontrado || encontrado.propietarioId !== usuarioId) throw formularioNoEncontrado();
  return encontrado;
}

export function formularioNoEncontrado(): ErrorAplicacion {
  return new ErrorAplicacion('no_encontrado', 'Formulario no encontrado');
}
