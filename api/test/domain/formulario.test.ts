import { describe, expect, it } from 'vitest';
import { crearSlug, validarDefinicion, validarTransicion, type Pregunta } from '../../src/domain/formulario.js';

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
