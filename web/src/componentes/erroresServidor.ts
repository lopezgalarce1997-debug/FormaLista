import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ErrorApi } from '../api/cliente';

/**
 * Lleva un error de la API al formulario: cada detalle { campo, mensaje } va debajo de su campo
 * (si el formulario lo tiene); todo lo demás se muestra como error general (root.servidor).
 */
export function aplicarErroresServidor<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  campos: readonly Path<T>[],
): void {
  const general = (mensaje: string) => setError('root.servidor', { message: mensaje });

  if (!(error instanceof ErrorApi)) return general('Ocurrió un error inesperado');

  const detallesDeCampos = error.detalles.filter((d) => (campos as readonly string[]).includes(d.campo));
  detallesDeCampos.forEach((d) => setError(d.campo as Path<T>, { message: d.mensaje }));
  if (detallesDeCampos.length === 0) general(error.message);
}
