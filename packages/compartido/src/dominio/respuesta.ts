import type { Pregunta, PreguntaEscala, PreguntaFecha, PreguntaOpciones, PreguntaTexto } from './formulario.js';

/**
 * Lo que envía quien responde: un objeto { [preguntaId]: valor }.
 * Los valores son `unknown` a propósito: vienen de JSON y su tipo correcto depende de la
 * definición de cada formulario, algo que un esquema estático (Zod) no puede saber de antemano.
 */
export type EntradaRespuestas = Record<string, unknown>;

/** Valor ya validado y normalizado, listo para guardarse. */
export type ValorRespuesta = string | string[] | number;

export interface RespuestaValidada {
  preguntaId: string;
  valor: ValorRespuesta;
}

export interface ErrorRespuesta {
  preguntaId: string;
  mensaje: string;
}

/**
 * Resultado en vez de excepción: una respuesta inválida es un caso esperado, y así se pueden
 * informar TODOS los errores a la vez (como ValidationResult en FluentValidation).
 */
export type ResultadoValidacion =
  | { valida: true; respuestas: RespuestaValidada[] }
  | { valida: false; errores: ErrorRespuesta[] };

/** Resultado de validar el valor de UNA pregunta. */
type ResultadoValor = { valido: true; valor: ValorRespuesta } | { valido: false; mensaje: string };

const ok = (valor: ValorRespuesta): ResultadoValor => ({ valido: true, valor });
const error = (mensaje: string): ResultadoValor => ({ valido: false, mensaje });

/**
 * Valida las respuestas contra las preguntas del formulario (en la versión que se respondió).
 * Reglas generales:
 * - No se aceptan respuestas a preguntas que no existen en el formulario.
 * - Las obligatorias deben tener un valor no vacío; las opcionales vacías se omiten.
 * - Cada valor presente se valida según el tipo de su pregunta.
 * Las respuestas válidas se devuelven en el orden de las preguntas del formulario.
 */
export function validarRespuestas(preguntas: Pregunta[], entrada: EntradaRespuestas): ResultadoValidacion {
  const errores: ErrorRespuesta[] = [];
  const respuestas: RespuestaValidada[] = [];

  const idsDelFormulario = new Set(preguntas.map((p) => p.id));
  for (const preguntaId of Object.keys(entrada)) {
    if (!idsDelFormulario.has(preguntaId)) {
      errores.push({ preguntaId, mensaje: 'La pregunta no existe en este formulario' });
    }
  }

  for (const pregunta of preguntas) {
    // Object.hasOwn: solo propiedades propias. Si una pregunta tuviera id "constructor",
    // entrada["constructor"] devolvería la función heredada de Object.prototype.
    const valor = Object.hasOwn(entrada, pregunta.id) ? entrada[pregunta.id] : undefined;

    if (esVacio(valor)) {
      if (pregunta.obligatoria) errores.push({ preguntaId: pregunta.id, mensaje: 'Es obligatoria' });
      continue;
    }

    const resultado = validarValor(pregunta, valor);
    if (resultado.valido) {
      respuestas.push({ preguntaId: pregunta.id, valor: resultado.valor });
    } else {
      errores.push({ preguntaId: pregunta.id, mensaje: resultado.mensaje });
    }
  }

  return errores.length > 0 ? { valida: false, errores } : { valida: true, respuestas };
}

/** Vacío = sin responder. Ojo: 0 y false NO son vacíos (0 es válido en una escala que parte en 0). */
function esVacio(valor: unknown): boolean {
  return (
    valor === undefined ||
    valor === null ||
    (typeof valor === 'string' && valor.trim() === '') ||
    (Array.isArray(valor) && valor.length === 0)
  );
}

function validarValor(pregunta: Pregunta, valor: unknown): ResultadoValor {
  switch (pregunta.tipo) {
    case 'texto_corto':
    case 'texto_largo':
      return validarTexto(pregunta, valor);
    case 'opcion_unica':
      return validarOpcionUnica(pregunta, valor);
    case 'opcion_multiple':
      return validarOpcionMultiple(pregunta, valor);
    case 'escala':
      return validarEscala(pregunta, valor);
    case 'fecha':
      return validarFecha(pregunta, valor);
    default:
      // Si se agrega un tipo nuevo a Pregunta y no se maneja aquí, esto no compila.
      return sinCasoPara(pregunta);
  }
}

// ---------------------------------------------------------------------------
// Validadores por tipo. Reciben un valor que YA se sabe que no está vacío.
// ---------------------------------------------------------------------------

function validarEscala(pregunta: PreguntaEscala, valor: unknown): ResultadoValor {
  // Estricto: "3" (texto) no se acepta; el cliente debe enviar un número JSON.
  // Number.isInteger descarta además decimales, NaN e Infinity.
  if (typeof valor !== 'number' || !Number.isInteger(valor)) {
    return error('Debe ser un número entero');
  }
  if (valor < pregunta.minimo || valor > pregunta.maximo) {
    return error(`Debe estar entre ${pregunta.minimo} y ${pregunta.maximo}`);
  }
  return ok(valor);
}

function validarOpcionMultiple(pregunta: PreguntaOpciones, valor: unknown): ResultadoValor {
  if (!Array.isArray(valor)) return error('Debe ser una lista de opciones');
  // El type guard (v is string) le dice a TypeScript que, si pasa, valor es string[].
  if (!valor.every((v): v is string => typeof v === 'string')) return error('Cada opción debe ser un texto');

  const elegidas = new Set<string>();
  for (const texto of valor) {
    const opcion = buscarOpcion(pregunta, texto);
    if (opcion === undefined) return error(`Opción no válida: "${texto}"`);
    if (elegidas.has(opcion)) return error(`Opción repetida: "${opcion}"`);
    elegidas.add(opcion);
  }

  // Se guarda en el orden del formulario (no en el que llegó): así dos respuestas con las
  // mismas opciones quedan idénticas, lo que simplifica mostrarlas y agregarlas en estadísticas.
  return ok(pregunta.opciones.filter((opcion) => elegidas.has(opcion)));
}

/**
 * Busca la opción del formulario que corresponde al texto recibido, sin distinguir mayúsculas
 * ni espacios alrededor. Devuelve el texto EXACTO definido en el formulario (forma canónica).
 * No hay ambigüedad: validarDefinicion ya impide opciones que solo difieran en eso.
 */
function buscarOpcion(pregunta: PreguntaOpciones, texto: string): string | undefined {
  const clave = normalizarOpcion(texto);
  return pregunta.opciones.find((opcion) => normalizarOpcion(opcion) === clave);
}

function normalizarOpcion(texto: string): string {
  return texto.trim().toLowerCase();
}

export const MAX_CARACTERES: Record<PreguntaTexto['tipo'], number> = {
  texto_corto: 200,
  texto_largo: 5000,
};

function validarTexto(pregunta: PreguntaTexto, valor: unknown): ResultadoValor {
  if (typeof valor !== 'string') return error('Debe ser un texto');

  const texto = valor.trim();
  // [...texto] cuenta caracteres reales (code points): un emoji cuenta como 1, no como 2 como en .length.
  const maximo = MAX_CARACTERES[pregunta.tipo];
  if ([...texto].length > maximo) return error(`Máximo ${maximo} caracteres`);

  return ok(texto);
}

function validarOpcionUnica(pregunta: PreguntaOpciones, valor: unknown): ResultadoValor {
  // Estricto con la forma: una sola opción es un texto, no una lista de un elemento.
  if (typeof valor !== 'string') return error('Debe ser una de las opciones (texto)');

  const opcion = buscarOpcion(pregunta, valor);
  if (opcion === undefined) return error(`Opción no válida: "${valor}"`);

  return ok(opcion);
}

const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Se guarda como texto "AAAA-MM-DD" y no como Date: una fecha sin hora no tiene zona horaria.
 * Con Date, "2026-03-01" guardado desde Chile (UTC-3) podría leerse como el 28 de febrero.
 */
function validarFecha(_pregunta: PreguntaFecha, valor: unknown): ResultadoValor {
  if (typeof valor !== 'string') return error('Debe ser una fecha con formato AAAA-MM-DD');

  const coincidencia = FORMATO_FECHA.exec(valor.trim());
  if (!coincidencia) return error('Debe ser una fecha con formato AAAA-MM-DD');

  const [, anio, mes, dia] = coincidencia.map(Number) as [number, number, number, number];
  if (!esFechaReal(anio, mes, dia)) return error('La fecha no existe');

  return ok(coincidencia[0]);
}

/** Descarta fechas imposibles como 2026-02-30 o 2026-13-01, respetando los años bisiestos. */
function esFechaReal(anio: number, mes: number, dia: number): boolean {
  if (anio < 1000) return false; // Date.UTC interpreta los años 0–99 como 1900–1999
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  // Date "corrige" las fechas inválidas (30 de febrero → 2 de marzo): si cambió algo, no existía.
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

function sinCasoPara(pregunta: never): never {
  throw new Error(`Tipo de pregunta no soportado: ${JSON.stringify(pregunta)}`);
}
