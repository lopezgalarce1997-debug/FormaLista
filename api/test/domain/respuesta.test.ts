import { describe, expect, it } from 'vitest';
import type { Pregunta, PreguntaEscala, PreguntaOpciones } from '../../src/domain/formulario.js';
import { validarRespuestas } from '../../src/domain/respuesta.js';

const escala = (id: string, cambios: Partial<PreguntaEscala> = {}): PreguntaEscala => ({
  id,
  tipo: 'escala',
  texto: `Pregunta ${id}`,
  obligatoria: false,
  minimo: 1,
  maximo: 5,
  ...cambios,
});

const multiple = (id: string, cambios: Partial<PreguntaOpciones> = {}): PreguntaOpciones => ({
  id,
  tipo: 'opcion_multiple',
  texto: `Pregunta ${id}`,
  obligatoria: false,
  opciones: ['Latte', 'Espresso', 'Capuccino'],
  ...cambios,
});

/** Atajo para validar una sola pregunta y obtener el resultado. */
const validarUna = (pregunta: Pregunta, valor: unknown) => validarRespuestas([pregunta], { [pregunta.id]: valor });

describe('validarRespuestas: reglas generales', () => {
  it('acepta respuestas válidas y las devuelve en el orden del formulario', () => {
    const preguntas = [escala('p1'), escala('p2')];

    const resultado = validarRespuestas(preguntas, { p2: 4, p1: 2 });

    expect(resultado).toEqual({
      valida: true,
      respuestas: [
        { preguntaId: 'p1', valor: 2 },
        { preguntaId: 'p2', valor: 4 },
      ],
    });
  });

  it.each([
    ['ausente', {}],
    ['null', { p1: null }],
    ['texto vacío', { p1: '' }],
    ['solo espacios', { p1: '   ' }],
    ['arreglo vacío', { p1: [] }],
  ])('rechaza una obligatoria sin responder (%s)', (_caso, entrada) => {
    const resultado = validarRespuestas([escala('p1', { obligatoria: true })], entrada);

    expect(resultado).toEqual({ valida: false, errores: [{ preguntaId: 'p1', mensaje: 'Es obligatoria' }] });
  });

  it('acepta una opcional sin responder y la omite del resultado', () => {
    const resultado = validarRespuestas([escala('p1'), escala('p2')], { p1: 3, p2: null });

    expect(resultado).toEqual({ valida: true, respuestas: [{ preguntaId: 'p1', valor: 3 }] });
  });

  it('rechaza respuestas a preguntas que no existen en el formulario', () => {
    const resultado = validarRespuestas([escala('p1')], { p1: 3, inventada: 'hola' });

    expect(resultado).toEqual({
      valida: false,
      errores: [{ preguntaId: 'inventada', mensaje: 'La pregunta no existe en este formulario' }],
    });
  });

  it('informa todos los errores a la vez, no solo el primero', () => {
    const preguntas = [escala('p1', { obligatoria: true }), escala('p2'), escala('p3')];

    const resultado = validarRespuestas(preguntas, { p2: 99, p3: 'tres', extra: 1 });

    expect(resultado.valida).toBe(false);
    if (!resultado.valida) {
      expect(resultado.errores.map((e) => e.preguntaId).sort()).toEqual(['extra', 'p1', 'p2', 'p3']);
    }
  });

  it('no confunde propiedades heredadas de Object con respuestas', () => {
    // Si no se usara Object.hasOwn, entrada["constructor"] sería la función Object y no "vacío".
    const resultado = validarRespuestas([escala('constructor', { obligatoria: true })], {});

    expect(resultado).toEqual({
      valida: false,
      errores: [{ preguntaId: 'constructor', mensaje: 'Es obligatoria' }],
    });
  });

  it('acepta un formulario sin preguntas con una entrada vacía', () => {
    expect(validarRespuestas([], {})).toEqual({ valida: true, respuestas: [] });
  });
});

describe('validarRespuestas: escala', () => {
  it.each([1, 3, 5])('acepta %i en una escala de 1 a 5 (incluye los extremos)', (valor) => {
    expect(validarUna(escala('p1'), valor)).toEqual({ valida: true, respuestas: [{ preguntaId: 'p1', valor }] });
  });

  it('acepta 0 cuando la escala parte en 0 (no lo trata como "sin responder")', () => {
    const resultado = validarUna(escala('p1', { minimo: 0, maximo: 10, obligatoria: true }), 0);

    expect(resultado).toEqual({ valida: true, respuestas: [{ preguntaId: 'p1', valor: 0 }] });
  });

  it.each([0, 6, -1, 100])('rechaza %i por estar fuera del rango 1–5', (valor) => {
    expect(validarUna(escala('p1'), valor)).toEqual({
      valida: false,
      errores: [{ preguntaId: 'p1', mensaje: 'Debe estar entre 1 y 5' }],
    });
  });

  it('usa el rango propio de cada pregunta en el mensaje', () => {
    expect(validarUna(escala('p1', { minimo: 0, maximo: 10 }), 11)).toMatchObject({
      errores: [{ mensaje: 'Debe estar entre 0 y 10' }],
    });
  });

  it.each([
    ['decimal', 3.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['número como texto', '3'],
    ['booleano', true],
    ['arreglo', [3]],
    ['objeto', { valor: 3 }],
  ])('rechaza un valor que no es un entero (%s)', (_caso, valor) => {
    expect(validarUna(escala('p1'), valor)).toEqual({
      valida: false,
      errores: [{ preguntaId: 'p1', mensaje: 'Debe ser un número entero' }],
    });
  });
});

describe('validarRespuestas: opción múltiple', () => {
  const invalida = (mensaje: string) => ({ valida: false, errores: [{ preguntaId: 'p1', mensaje }] });

  it('acepta varias opciones válidas', () => {
    expect(validarUna(multiple('p1'), ['Latte', 'Capuccino'])).toEqual({
      valida: true,
      respuestas: [{ preguntaId: 'p1', valor: ['Latte', 'Capuccino'] }],
    });
  });

  it('acepta una sola opción (sigue siendo una lista)', () => {
    expect(validarUna(multiple('p1'), ['Espresso'])).toMatchObject({ respuestas: [{ valor: ['Espresso'] }] });
  });

  it('acepta todas las opciones', () => {
    expect(validarUna(multiple('p1'), ['Latte', 'Espresso', 'Capuccino'])).toMatchObject({ valida: true });
  });

  it('devuelve las opciones en el orden del formulario, no en el que llegaron', () => {
    expect(validarUna(multiple('p1'), ['Capuccino', 'Latte'])).toMatchObject({
      respuestas: [{ valor: ['Latte', 'Capuccino'] }],
    });
  });

  it('ignora mayúsculas y espacios, y guarda el texto exacto del formulario', () => {
    expect(validarUna(multiple('p1'), [' latte ', 'CAPUCCINO'])).toMatchObject({
      respuestas: [{ valor: ['Latte', 'Capuccino'] }],
    });
  });

  it.each([
    ['texto suelto', 'Latte'],
    ['número', 1],
    ['booleano', true],
    ['objeto', { opcion: 'Latte' }],
  ])('rechaza un valor que no es una lista (%s)', (_caso, valor) => {
    expect(validarUna(multiple('p1'), valor)).toEqual(invalida('Debe ser una lista de opciones'));
  });

  it.each([
    ['número', [1]],
    ['null dentro', ['Latte', null]],
    ['lista anidada', [['Latte']]],
  ])('rechaza una lista con elementos que no son texto (%s)', (_caso, valor) => {
    expect(validarUna(multiple('p1'), valor)).toEqual(invalida('Cada opción debe ser un texto'));
  });

  it('rechaza una opción que no existe en la pregunta', () => {
    expect(validarUna(multiple('p1'), ['Latte', 'Mocca'])).toEqual(invalida('Opción no válida: "Mocca"'));
  });

  it('rechaza un texto vacío dentro de la lista', () => {
    expect(validarUna(multiple('p1'), ['Latte', ''])).toEqual(invalida('Opción no válida: ""'));
  });

  it('rechaza opciones repetidas, también si solo difieren en mayúsculas o espacios', () => {
    expect(validarUna(multiple('p1'), ['Latte', ' LATTE'])).toEqual(invalida('Opción repetida: "Latte"'));
  });

  it('una obligatoria con la lista vacía cuenta como sin responder', () => {
    expect(validarUna(multiple('p1', { obligatoria: true }), [])).toEqual(invalida('Es obligatoria'));
  });

  it('una opcional con la lista vacía se omite del resultado', () => {
    expect(validarUna(multiple('p1'), [])).toEqual({ valida: true, respuestas: [] });
  });
});
