/**
 * Tipos de error que la capa de aplicación puede producir. Son independientes de HTTP:
 * la capa http decide qué código de estado corresponde a cada uno.
 */
export type TipoError = 'validacion' | 'no_autorizado' | 'prohibido' | 'no_encontrado' | 'conflicto';

/** Error esperado del negocio. Su mensaje está pensado para mostrarse al cliente. */
export class ErrorAplicacion extends Error {
  readonly tipo: TipoError;

  constructor(tipo: TipoError, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorAplicacion';
    this.tipo = tipo;
  }
}
