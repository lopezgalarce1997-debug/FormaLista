/**
 * Cómo llega un tipo al cliente después de pasar por JSON: las fechas (Date) viajan como texto ISO.
 * La web usa Serializado<T> para tipar las respuestas de la API sin duplicar las interfaces.
 */
export type Serializado<T> = T extends Date
  ? string
  : T extends (infer E)[]
    ? Serializado<E>[]
    : T extends object
      ? { [K in keyof T]: Serializado<T[K]> }
      : T;
