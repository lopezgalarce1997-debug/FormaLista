import { describe, expect, it } from 'vitest';
import type { Pregunta, PreguntaEscala, PreguntaOpciones, PreguntaTexto } from '../src/dominio/formulario.js';
import { MAX_CARACTERES, validarRespuestas } from '../src/dominio/respuesta.js';

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

const unica = (id: string, cambios: Partial<PreguntaOpciones> = {}): PreguntaOpciones => ({
  ...multiple(id, cambios),
  tipo: 'opcion_unica',
});

const texto = (id: string, tipo: PreguntaTexto['tipo'] = 'texto_corto', obligatoria = false): PreguntaTexto => ({
  id,
  tipo,
  texto: `Pregunta ${id}`,
  obligatoria,
});

const fecha = (id: string, obligatoria = false): Pregunta => ({ id, tipo: 'fecha', texto: `Pregunta ${id}`, obligatoria });

/** Resultado esperado cuando la única pregunta (p1) es inválida. */
const invalida = (mensaje: string) => ({ valida: false, errores: [{ preguntaId: 'p1', mensaje }] });

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

describe('validarRespuestas: texto corto y largo', () => {
  it('acepta un texto y lo guarda sin espacios alrededor', () => {
    expect(validarUna(texto('p1'), '  Ana María  ')).toEqual({
      valida: true,
      respuestas: [{ preguntaId: 'p1', valor: 'Ana María' }],
    });
  });

  it('conserva los saltos de línea internos de un texto largo', () => {
    expect(validarUna(texto('p1', 'texto_largo'), 'Línea 1\nLínea 2')).toMatchObject({
      respuestas: [{ valor: 'Línea 1\nLínea 2' }],
    });
  });

  it.each([
    ['texto_corto', MAX_CARACTERES.texto_corto],
    ['texto_largo', MAX_CARACTERES.texto_largo],
  ] as const)('%s acepta exactamente %i caracteres y rechaza uno más', (tipo, maximo) => {
    expect(validarUna(texto('p1', tipo), 'a'.repeat(maximo))).toMatchObject({ valida: true });
    expect(validarUna(texto('p1', tipo), 'a'.repeat(maximo + 1))).toEqual(invalida(`Máximo ${maximo} caracteres`));
  });

  it('cuenta un emoji como un solo carácter', () => {
    // '😀'.length es 2 en JavaScript (UTF-16), pero para quien escribe es un carácter.
    const maximo = MAX_CARACTERES.texto_corto;

    expect(validarUna(texto('p1'), '😀'.repeat(maximo))).toMatchObject({ valida: true });
  });

  it('los espacios alrededor no cuentan para el máximo', () => {
    expect(validarUna(texto('p1'), `   ${'a'.repeat(MAX_CARACTERES.texto_corto)}   `)).toMatchObject({ valida: true });
  });

  it('una obligatoria con solo espacios cuenta como sin responder', () => {
    expect(validarUna(texto('p1', 'texto_corto', true), '   ')).toEqual(invalida('Es obligatoria'));
  });

  it.each([
    ['número', 42],
    ['booleano', false],
    ['lista', ['hola']],
    ['objeto', { texto: 'hola' }],
  ])('rechaza un valor que no es texto (%s)', (_caso, valor) => {
    expect(validarUna(texto('p1'), valor)).toEqual(invalida('Debe ser un texto'));
  });
});

describe('validarRespuestas: opción única', () => {
  it('acepta una opción válida', () => {
    expect(validarUna(unica('p1'), 'Espresso')).toEqual({
      valida: true,
      respuestas: [{ preguntaId: 'p1', valor: 'Espresso' }],
    });
  });

  it('ignora mayúsculas y espacios, y guarda el texto exacto del formulario', () => {
    expect(validarUna(unica('p1'), '  espresso ')).toMatchObject({ respuestas: [{ valor: 'Espresso' }] });
  });

  it('rechaza una opción que no existe en la pregunta', () => {
    expect(validarUna(unica('p1'), 'Mocca')).toEqual(invalida('Opción no válida: "Mocca"'));
  });

  it.each([
    ['lista de una opción', ['Latte']],
    ['lista de varias', ['Latte', 'Espresso']],
    ['número (índice)', 0],
    ['booleano', true],
  ])('rechaza un valor que no es un texto (%s)', (_caso, valor) => {
    expect(validarUna(unica('p1'), valor)).toEqual(invalida('Debe ser una de las opciones (texto)'));
  });

  it('una obligatoria sin responder da error', () => {
    expect(validarUna(unica('p1', { obligatoria: true }), '')).toEqual(invalida('Es obligatoria'));
  });
});

describe('validarRespuestas: fecha', () => {
  it.each(['2026-09-25', '1990-01-01', '2024-02-29', '2000-02-29', '9999-12-31'])('acepta %s', (valor) => {
    expect(validarUna(fecha('p1'), valor)).toEqual({ valida: true, respuestas: [{ preguntaId: 'p1', valor }] });
  });

  it('acepta espacios alrededor y guarda la fecha limpia', () => {
    expect(validarUna(fecha('p1'), ' 2026-09-25 ')).toMatchObject({ respuestas: [{ valor: '2026-09-25' }] });
  });

  it.each([
    ['30 de febrero', '2026-02-30'],
    ['29 de febrero en año no bisiesto', '2026-02-29'],
    ['29 de febrero de 1900 (no bisiesto: divisible por 100)', '1900-02-29'],
    ['mes 13', '2026-13-01'],
    ['mes 0', '2026-00-10'],
    ['día 0', '2026-01-00'],
    ['31 de abril', '2026-04-31'],
    ['año 0099 (Date.UTC lo convertiría en 1999)', '0099-01-01'],
  ])('rechaza una fecha que no existe (%s)', (_caso, valor) => {
    expect(validarUna(fecha('p1'), valor)).toEqual(invalida('La fecha no existe'));
  });

  it.each([
    ['formato día/mes/año', '25/09/2026'],
    ['sin ceros a la izquierda', '2026-9-5'],
    ['con hora (ISO completo)', '2026-09-25T10:00:00Z'],
    ['texto libre', 'mañana'],
    ['número (timestamp)', 1790000000000],
    ['objeto', { anio: 2026 }],
  ])('rechaza un formato distinto de AAAA-MM-DD (%s)', (_caso, valor) => {
    expect(validarUna(fecha('p1'), valor)).toEqual(invalida('Debe ser una fecha con formato AAAA-MM-DD'));
  });

  it('una obligatoria sin responder da error', () => {
    expect(validarUna(fecha('p1', true), null)).toEqual(invalida('Es obligatoria'));
  });
});

describe('validarRespuestas: formulario completo', () => {
  const preguntas: Pregunta[] = [
    texto('nombre', 'texto_corto', true),
    texto('comentarios', 'texto_largo'),
    unica('favorito', { obligatoria: true }),
    multiple('extras'),
    escala('satisfaccion', { obligatoria: true }),
    fecha('visita'),
  ];

  it('valida y normaliza un formulario con todos los tipos de pregunta', () => {
    const resultado = validarRespuestas(preguntas, {
      visita: '2026-09-20',
      satisfaccion: 4,
      extras: ['capuccino', 'Latte'],
      favorito: 'latte',
      nombre: ' Ana ',
    });

    expect(resultado).toEqual({
      valida: true,
      respuestas: [
        { preguntaId: 'nombre', valor: 'Ana' },
        { preguntaId: 'favorito', valor: 'Latte' },
        { preguntaId: 'extras', valor: ['Latte', 'Capuccino'] },
        { preguntaId: 'satisfaccion', valor: 4 },
        { preguntaId: 'visita', valor: '2026-09-20' },
      ],
    });
  });

  it('informa un error por cada pregunta con problemas, de distintos tipos', () => {
    const resultado = validarRespuestas(preguntas, {
      nombre: 123,
      favorito: 'Mocca',
      extras: 'Latte',
      satisfaccion: 9,
      visita: '2026-02-30',
      desconocida: 'x',
    });

    expect(resultado).toEqual({
      valida: false,
      errores: expect.arrayContaining([
        { preguntaId: 'desconocida', mensaje: 'La pregunta no existe en este formulario' },
        { preguntaId: 'nombre', mensaje: 'Debe ser un texto' },
        { preguntaId: 'favorito', mensaje: 'Opción no válida: "Mocca"' },
        { preguntaId: 'extras', mensaje: 'Debe ser una lista de opciones' },
        { preguntaId: 'satisfaccion', mensaje: 'Debe estar entre 1 y 5' },
        { preguntaId: 'visita', mensaje: 'La fecha no existe' },
      ]),
    });
    if (!resultado.valida) expect(resultado.errores).toHaveLength(6);
  });
});
