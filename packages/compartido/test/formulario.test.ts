import { describe, expect, it } from 'vitest';
import {
  crearSlug,
  decidirEdicion,
  erroresDeDefinicion,
  preguntasDeVersion,
  validarCambioDeTipos,
  validarDefinicion,
  validarTransicion,
  type Pregunta,
} from '../src/dominio/formulario.js';

const texto = (id: string): Pregunta => ({ id, tipo: 'texto_corto', texto: '¿Nombre?', obligatoria: true });

describe('validarDefinicion', () => {
  it('acepta un formulario válido con todos los tipos de pregunta', () => {
    const preguntas: Pregunta[] = [
      texto('p1'),
      { id: 'p2', tipo: 'texto_largo', texto: 'Comentarios', obligatoria: false },
      { id: 'p3', tipo: 'opcion_unica', texto: 'Color', obligatoria: true, opciones: ['Rojo', 'Azul'] },
      { id: 'p4', tipo: 'opcion_multiple', texto: 'Frutas', obligatoria: false, opciones: ['Manzana', 'Pera'] },
      { id: 'p5', tipo: 'escala', texto: 'Satisfacción', obligatoria: true, minimo: 1, maximo: 5 },
      { id: 'p6', tipo: 'fecha', texto: 'Nacimiento', obligatoria: false },
    ];

    expect(validarDefinicion(preguntas)).toEqual([]);
  });

  it('acepta un formulario sin preguntas (borrador recién creado)', () => {
    expect(validarDefinicion([])).toEqual([]);
  });

  it('rechaza ids de pregunta repetidos', () => {
    expect(validarDefinicion([texto('p1'), texto('p1')])).toEqual(['Pregunta 2: el id "p1" está repetido']);
  });

  it('rechaza preguntas de opción con menos de 2 opciones', () => {
    const errores = validarDefinicion([
      { id: 'p1', tipo: 'opcion_unica', texto: 'x', obligatoria: false, opciones: ['Solo una'] },
    ]);

    expect(errores).toEqual(['Pregunta 1: necesita al menos 2 opciones']);
  });

  it('rechaza opciones repetidas sin importar mayúsculas ni espacios', () => {
    const errores = validarDefinicion([
      { id: 'p1', tipo: 'opcion_multiple', texto: 'x', obligatoria: false, opciones: ['Sí', ' sí ', 'No'] },
    ]);

    expect(errores).toEqual(['Pregunta 1: tiene opciones repetidas']);
  });

  it.each([
    [5, 5],
    [5, 1],
  ])('rechaza una escala con mínimo %i y máximo %i', (minimo, maximo) => {
    const errores = validarDefinicion([{ id: 'p1', tipo: 'escala', texto: 'x', obligatoria: false, minimo, maximo }]);

    expect(errores).toEqual(['Pregunta 1: el mínimo de la escala debe ser menor que el máximo']);
  });

  it('informa todos los errores a la vez', () => {
    const errores = validarDefinicion([
      texto('p1'),
      texto('p1'),
      { id: 'p3', tipo: 'escala', texto: 'x', obligatoria: false, minimo: 3, maximo: 2 },
    ]);

    expect(errores).toHaveLength(2);
  });
});

describe('crearSlug', () => {
  it('quita tildes y símbolos, pasa a minúsculas y agrega el sufijo', () => {
    expect(crearSlug('Encuesta de Café ☕ 2026!', 'abc123')).toBe('encuesta-de-cafe-2026-abc123');
  });

  it('recorta títulos largos sin dejar guiones al final', () => {
    const slug = crearSlug(`${'a'.repeat(49)} b`, 'x');

    expect(slug).toBe(`${'a'.repeat(49)}-x`);
  });

  it('usa "formulario" si el título no tiene letras ni números', () => {
    expect(crearSlug('☕☕☕', 'x')).toBe('formulario-x');
  });
});

describe('validarTransicion (máquina de estados)', () => {
  it.each([
    ['publicar', 'borrador', 'publicado'],
    ['publicar', 'cerrado', 'publicado (reabrir)'],
    ['cerrar', 'publicado', 'cerrado'],
  ] as const)('permite %s desde %s → %s', (accion, estado, _resultado) => {
    expect(validarTransicion(accion, estado, 3)).toBeNull();
  });

  it.each([
    ['publicar', 'publicado', 'El formulario ya está publicado'],
    ['cerrar', 'cerrado', 'El formulario ya está cerrado'],
    ['cerrar', 'borrador', 'Solo se puede cerrar un formulario publicado'],
  ] as const)('rechaza %s desde %s', (accion, estado, mensaje) => {
    expect(validarTransicion(accion, estado, 3)).toEqual({ motivo: 'estado_invalido', mensaje });
  });

  it('no permite publicar un formulario sin preguntas', () => {
    expect(validarTransicion('publicar', 'borrador', 0)).toEqual({
      motivo: 'sin_preguntas',
      mensaje: 'No se puede publicar un formulario sin preguntas',
    });
  });

  it('sí permite cerrar un formulario aunque no tenga preguntas', () => {
    expect(validarTransicion('cerrar', 'publicado', 0)).toBeNull();
  });
});

describe('Versionado: decidirEdicion', () => {
  const favorito: Pregunta = { id: 'fav', tipo: 'opcion_unica', texto: '¿Favorito?', obligatoria: false, opciones: ['A', 'B'] };
  const nota: Pregunta = { id: 'nota', tipo: 'escala', texto: 'Nota', obligatoria: true, minimo: 1, maximo: 5 };
  const anteriores = [favorito, nota];

  it('en borrador siempre edita en el lugar, aunque cambien las preguntas', () => {
    expect(decidirEdicion('borrador', anteriores, [nota])).toBe('en_lugar');
  });

  it.each(['publicado', 'cerrado'] as const)('en %s, con las mismas preguntas, edita en el lugar', (estado) => {
    // Mismo contenido, con las propiedades en otro orden (como llegan de Zod vs. Mongo).
    const mismas: Pregunta[] = [
      { opciones: ['A', 'B'], obligatoria: false, texto: '¿Favorito?', tipo: 'opcion_unica', id: 'fav' },
      { ...nota },
    ];

    expect(decidirEdicion(estado, anteriores, mismas)).toBe('en_lugar');
  });

  it.each([
    ['cambia el texto', [{ ...favorito, texto: '¿Cuál prefieres?' }, nota]],
    ['agrega una opción', [{ ...favorito, opciones: ['A', 'B', 'C'] }, nota]],
    ['cambia obligatoria', [favorito, { ...nota, obligatoria: false }]],
    ['cambia el rango de la escala', [favorito, { ...nota, maximo: 10 }]],
    ['reordena', [nota, favorito]],
    ['quita una pregunta', [favorito]],
    ['agrega una pregunta', [favorito, nota, { id: 'x', tipo: 'fecha', texto: 'x', obligatoria: false }]],
  ] as [string, Pregunta[]][])('en publicado, si %s, crea una versión nueva', (_caso, nuevas) => {
    expect(decidirEdicion('publicado', anteriores, nuevas)).toBe('nueva_version');
  });
});

describe('Versionado: validarCambioDeTipos', () => {
  const anteriores: Pregunta[] = [
    { id: 'fav', tipo: 'opcion_unica', texto: 'x', obligatoria: false, opciones: ['A', 'B'] },
    { id: 'nota', tipo: 'escala', texto: 'x', obligatoria: false, minimo: 1, maximo: 5 },
  ];

  it('acepta mantener los tipos, quitar preguntas y agregar preguntas nuevas', () => {
    const nuevas: Pregunta[] = [
      { id: 'nota', tipo: 'escala', texto: 'otro texto', obligatoria: true, minimo: 0, maximo: 10 },
      { id: 'nueva', tipo: 'texto_corto', texto: 'x', obligatoria: false },
    ];

    expect(validarCambioDeTipos(anteriores, nuevas)).toEqual([]);
  });

  it('rechaza cambiar el tipo de una pregunta existente (mismo id)', () => {
    const nuevas: Pregunta[] = [{ id: 'fav', tipo: 'opcion_multiple', texto: 'x', obligatoria: false, opciones: ['A', 'B'] }];

    expect(validarCambioDeTipos(anteriores, nuevas)).toEqual([
      'Pregunta 1: no se puede cambiar el tipo de una pregunta ya publicada (de opcion_unica a opcion_multiple); crea una pregunta nueva',
    ]);
  });
});

describe('Versionado: preguntasDeVersion', () => {
  const v1: Pregunta[] = [{ id: 'a', tipo: 'texto_corto', texto: 'v1', obligatoria: false }];
  const v2: Pregunta[] = [{ id: 'b', tipo: 'fecha', texto: 'v2', obligatoria: false }];
  const versiones = [
    { version: 1, preguntas: v1, reemplazadaEn: new Date() },
    { version: 2, preguntas: v2, reemplazadaEn: null },
  ];

  it('devuelve las preguntas de la vigente y de una anterior', () => {
    expect(preguntasDeVersion(versiones, 2)).toBe(v2);
    expect(preguntasDeVersion(versiones, 1)).toBe(v1);
  });

  it('devuelve null si la versión no existe', () => {
    expect(preguntasDeVersion(versiones, 3)).toBeNull();
  });
});

describe('erroresDeDefinicion (errores ubicados, para la web)', () => {
  it('indica la pregunta y el campo de cada error', () => {
    const errores = erroresDeDefinicion([
      texto('p1'),
      { id: 'p2', tipo: 'opcion_unica', texto: 'x', obligatoria: false, opciones: ['Sí', 'sí'] },
      { id: 'p3', tipo: 'escala', texto: 'x', obligatoria: false, minimo: 5, maximo: 5 },
      texto('p1'),
    ]);

    expect(errores).toEqual([
      { indice: 1, campo: 'opciones', mensaje: 'Tiene opciones repetidas' },
      { indice: 2, campo: 'minimo', mensaje: 'El mínimo de la escala debe ser menor que el máximo' },
      { indice: 3, campo: 'id', mensaje: 'El id "p1" está repetido' },
    ]);
  });

  it('validarDefinicion conserva exactamente los textos de antes (la API no cambia)', () => {
    const preguntas: Pregunta[] = [{ id: 'p1', tipo: 'opcion_multiple', texto: 'x', obligatoria: false, opciones: ['A'] }];

    expect(validarDefinicion(preguntas)).toEqual(['Pregunta 1: necesita al menos 2 opciones']);
  });
});
