/**
 * Tipos de error que la capa de aplicación puede producir. Son independientes de HTTP:
 * la capa http decide qué código de estado corresponde a cada uno.
 */
export type TipoError = 'validacion' | 'no_autorizado' | 'prohibido' | 'no_encontrado' | 'conflicto' | 'no_disponible';

/** Error puntual de un campo, con el mismo formato que usa la validación con Zod. */
export interface DetalleError {
  campo: string;
  mensaje: string;
}

/** Error esperado del negocio. Su mensaje (y sus detalles) están pensados para mostrarse al cliente. */
export class ErrorAplicacion extends Error {
  readonly tipo: TipoError;
  readonly detalles?: DetalleError[];

  constructor(tipo: TipoError, mensaje: string, detalles?: DetalleError[]) {
    super(mensaje);
    this.name = 'ErrorAplicacion';
    this.tipo = tipo;
    this.detalles = detalles;
  }
}
