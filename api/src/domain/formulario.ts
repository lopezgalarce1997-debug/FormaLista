export const TIPOS_PREGUNTA = [
  'texto_corto',
  'texto_largo',
  'opcion_unica',
  'opcion_multiple',
  'escala',
  'fecha',
] as const;

export type TipoPregunta = (typeof TIPOS_PREGUNTA)[number];

interface PreguntaBase {
  /** Id estable: no cambia al reordenar o editar el texto (las respuestas lo referencian). */
  id: string;
  texto: string;
  obligatoria: boolean;
}

export interface PreguntaTexto extends PreguntaBase {
  tipo: 'texto_corto' | 'texto_largo';
}

export interface PreguntaOpciones extends PreguntaBase {
  tipo: 'opcion_unica' | 'opcion_multiple';
  opciones: string[];
}

export interface PreguntaEscala extends PreguntaBase {
  tipo: 'escala';
  minimo: number;
  maximo: number;
}

export interface PreguntaFecha extends PreguntaBase {
  tipo: 'fecha';
}

/** Unión discriminada por `tipo`: TypeScript sabe qué campos tiene cada variante. */
export type Pregunta = PreguntaTexto | PreguntaOpciones | PreguntaEscala | PreguntaFecha;

export type EstadoFormulario = 'borrador' | 'publicado' | 'cerrado';

export type AccionEstado = 'publicar' | 'cerrar';

/**
 * Máquina de estados del formulario:
 *   borrador ──publicar──▶ publicado ──cerrar──▶ cerrado
 *                              ▲                    │
 *                              └─────publicar───────┘  (reabrir)
 */
export const TRANSICIONES: Record<AccionEstado, { desde: EstadoFormulario[]; hacia: EstadoFormulario }> = {
  publicar: { desde: ['borrador', 'cerrado'], hacia: 'publicado' },
  cerrar: { desde: ['publicado'], hacia: 'cerrado' },
};

export interface TransicionInvalida {
  /** estado_invalido: la acción no aplica al estado actual. sin_preguntas: falta contenido. */
  motivo: 'estado_invalido' | 'sin_preguntas';
  mensaje: string;
}

/** Devuelve por qué no se puede aplicar la acción, o null si se puede. */
export function validarTransicion(
  accion: AccionEstado,
  estadoActual: EstadoFormulario,
  cantidadPreguntas: number,
): TransicionInvalida | null {
  if (!TRANSICIONES[accion].desde.includes(estadoActual)) {
    const mensaje =
      accion === 'publicar'
        ? 'El formulario ya está publicado'
        : estadoActual === 'cerrado'
          ? 'El formulario ya está cerrado'
          : 'Solo se puede cerrar un formulario publicado';
    return { motivo: 'estado_invalido', mensaje };
  }
  if (accion === 'publicar' && cantidadPreguntas === 0) {
    return { motivo: 'sin_preguntas', mensaje: 'No se puede publicar un formulario sin preguntas' };
  }
  return null;
}

export interface Formulario {
  id: string;
  titulo: string;
  descripcion: string;
  slug: string;
  version: number;
  preguntas: Pregunta[];
  creadoEn: Date;
  actualizadoEn: Date;
}

// ---------------------------------------------------------------------------
// Versionado
// ---------------------------------------------------------------------------

/** Las preguntas de una versión. reemplazadaEn es null para la versión vigente. */
export interface VersionFormulario {
  version: number;
  preguntas: Pregunta[];
  reemplazadaEn: Date | null;
}

/** Devuelve las preguntas de la versión pedida, o null si esa versión no existe. */
export function preguntasDeVersion(versiones: VersionFormulario[], version: number): Pregunta[] | null {
  return versiones.find((v) => v.version === version)?.preguntas ?? null;
}

export type ModoEdicion = 'en_lugar' | 'nueva_version';

/**
 * Decide si una edición sobrescribe la versión vigente o crea una nueva.
 * - Borrador: nunca se publicó, no puede tener respuestas → en el lugar.
 * - Publicado o cerrado: si cambian las preguntas → nueva versión. Si solo cambian título o
 *   descripción, no afecta cómo se interpretan las respuestas → en el lugar.
 * Se usa el estado y no "tiene respuestas" para evitar una carrera: una respuesta podría llegar
 * entre el chequeo y la escritura y quedar asociada a preguntas que ya no existen.
 */
export function decidirEdicion(estado: EstadoFormulario, anteriores: Pregunta[], nuevas: Pregunta[]): ModoEdicion {
  if (estado === 'borrador' || sonMismasPreguntas(anteriores, nuevas)) return 'en_lugar';
  return 'nueva_version';
}

/** Compara el contenido de las preguntas, en orden (reordenar también es un cambio). */
export function sonMismasPreguntas(a: Pregunta[], b: Pregunta[]): boolean {
  return a.length === b.length && a.every((pregunta, i) => firma(pregunta) === firma(b[i]!));
}

/** Representación canónica: no depende del orden de las propiedades del objeto (Mongo vs. Zod). */
function firma(p: Pregunta): string {
  return JSON.stringify([
    p.id,
    p.tipo,
    p.texto,
    p.obligatoria,
    'opciones' in p ? p.opciones : null,
    'minimo' in p ? [p.minimo, p.maximo] : null,
  ]);
}

/**
 * En un formulario ya publicado, una pregunta existente (mismo id) no puede cambiar de tipo:
 * sus respuestas antiguas y nuevas tendrían formas incompatibles. Para otro tipo, se crea otra pregunta.
 */
export function validarCambioDeTipos(anteriores: Pregunta[], nuevas: Pregunta[]): string[] {
  const tipoAnterior = new Map(anteriores.map((p) => [p.id, p.tipo]));
  return nuevas.flatMap((pregunta, indice) => {
    const tipo = tipoAnterior.get(pregunta.id);
    return tipo !== undefined && tipo !== pregunta.tipo
      ? [`Pregunta ${indice + 1}: no se puede cambiar el tipo de una pregunta ya publicada (de ${tipo} a ${pregunta.tipo}); crea una pregunta nueva`]
      : [];
  });
}

/** Reglas de negocio de la definición de un formulario. Devuelve la lista de errores (vacía si es válida). */
export function validarDefinicion(preguntas: Pregunta[]): string[] {
  const errores: string[] = [];
  const idsVistos = new Set<string>();

  preguntas.forEach((pregunta, indice) => {
    const posicion = `Pregunta ${indice + 1}`;

    if (idsVistos.has(pregunta.id)) errores.push(`${posicion}: el id "${pregunta.id}" está repetido`);
    idsVistos.add(pregunta.id);

    if (pregunta.tipo === 'opcion_unica' || pregunta.tipo === 'opcion_multiple') {
      if (pregunta.opciones.length < 2) errores.push(`${posicion}: necesita al menos 2 opciones`);
      const normalizadas = pregunta.opciones.map((o) => o.trim().toLowerCase());
      if (new Set(normalizadas).size !== normalizadas.length) errores.push(`${posicion}: tiene opciones repetidas`);
    }

    if (pregunta.tipo === 'escala' && pregunta.minimo >= pregunta.maximo) {
      errores.push(`${posicion}: el mínimo de la escala debe ser menor que el máximo`);
    }
  });

  return errores;
}

/**
 * Slug para el link público: el título legible + un sufijo aleatorio que lo hace único
 * y difícil de adivinar. Ej.: "Encuesta de café ☕" → "encuesta-de-cafe-k3x9q2m7".
 */
export function crearSlug(titulo: string, sufijo: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes: "café" → "cafe"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  return `${base || 'formulario'}-${sufijo}`;
}
