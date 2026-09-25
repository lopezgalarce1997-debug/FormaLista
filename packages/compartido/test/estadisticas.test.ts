import { describe, expect, it } from 'vitest';
import {
  completarDias,
  construirResultados,
  idsPorTipo,
  type AgregadosCrudos,
  type EstadisticaPregunta,
} from '../src/dominio/estadisticas.js';
import type { Pregunta, VersionFormulario } from '../src/dominio/formulario.js';

const vacios: AgregadosCrudos = {
  total: 0,
  porVersion: [],
  porDia: [],
  respondidas: [],
  conteos: [],
  escalas: [],
  fechas: [],
  textos: [],
};

const crudos = (parcial: Partial<AgregadosCrudos>): AgregadosCrudos => ({ ...vacios, ...parcial });
const version = (numero: number, preguntas: Pregunta[]): VersionFormulario => ({
  version: numero,
  preguntas,
  reemplazadaEn: null,
});

const favorito = (opciones: string[], texto = '¿Favorito?'): Pregunta => ({
  id: 'fav',
  tipo: 'opcion_unica',
  texto,
  obligatoria: false,
  opciones,
});
const nota = (minimo = 1, maximo = 5): Pregunta => ({ id: 'nota', tipo: 'escala', texto: 'Nota', obligatoria: false, minimo, maximo });

/** Busca la estadística de una pregunta y la devuelve con su tipo concreto. */
function de<T extends EstadisticaPregunta['tipo']>(
  lista: EstadisticaPregunta[],
  id: string,
  _tipo: T,
): EstadisticaPregunta & { tipo: T } {
  // La intersección conserva la variante aunque su `tipo` sea una unión ('opcion_unica' | 'opcion_multiple').
  return lista.find((p) => p.id === id) as EstadisticaPregunta & { tipo: T };
}

describe('construirResultados: opciones', () => {
  it('cuenta por opción, incluye las opciones sin votos con 0 y respeta el orden del formulario', () => {
    const r = construirResultados(
      [version(1, [favorito(['Latte', 'Espresso', 'Mocca'])])],
      crudos({
        total: 3,
        porVersion: [{ version: 1, cantidad: 3 }],
        respondidas: [{ version: 1, preguntaId: 'fav', cantidad: 3 }],
        conteos: [
          { version: 1, preguntaId: 'fav', valor: 'Mocca', cantidad: 1 },
          { version: 1, preguntaId: 'fav', valor: 'Latte', cantidad: 2 },
        ],
      }),
      'todas',
    );

    expect(de(r.preguntas, 'fav', 'opcion_unica')).toMatchObject({
      respondieron: 3,
      posibles: 3,
      opciones: [
        { valor: 'Latte', cantidad: 2 },
        { valor: 'Espresso', cantidad: 0 },
        { valor: 'Mocca', cantidad: 1 },
      ],
    });
  });

  it('combina versiones y pone las opciones eliminadas en un bucket aparte marcado', () => {
    const r = construirResultados(
      [version(1, [favorito(['Latte', 'Mocca'])]), version(2, [favorito(['Latte', 'Espresso'], '¿Cuál prefieres?')])],
      crudos({
        total: 10,
        porVersion: [
          { version: 1, cantidad: 4 },
          { version: 2, cantidad: 6 },
        ],
        respondidas: [
          { version: 1, preguntaId: 'fav', cantidad: 4 },
          { version: 2, preguntaId: 'fav', cantidad: 5 },
        ],
        conteos: [
          { version: 1, preguntaId: 'fav', valor: 'Latte', cantidad: 1 },
          { version: 1, preguntaId: 'fav', valor: 'Mocca', cantidad: 3 },
          { version: 2, preguntaId: 'fav', valor: 'Latte', cantidad: 2 },
          { version: 2, preguntaId: 'fav', valor: 'Espresso', cantidad: 3 },
        ],
      }),
      'todas',
    );

    expect(de(r.preguntas, 'fav', 'opcion_unica')).toMatchObject({
      texto: '¿Cuál prefieres?',
      textoCambio: true,
      versiones: [1, 2],
      respondieron: 9,
      posibles: 10,
      opciones: [
        { valor: 'Latte', cantidad: 3 },
        { valor: 'Espresso', cantidad: 3 },
        { valor: 'Mocca', cantidad: 3, yaNoExiste: true },
      ],
    });
  });

  it('con una versión elegida, usa solo esa versión', () => {
    const r = construirResultados(
      [version(1, [favorito(['Latte', 'Mocca'])]), version(2, [favorito(['Latte', 'Espresso'])])],
      crudos({
        total: 4,
        porVersion: [{ version: 1, cantidad: 4 }],
        conteos: [{ version: 1, preguntaId: 'fav', valor: 'Mocca', cantidad: 4 }],
      }),
      1,
    );

    expect(r.version).toBe(1);
    expect(de(r.preguntas, 'fav', 'opcion_unica').opciones).toEqual([
      { valor: 'Latte', cantidad: 0 },
      { valor: 'Mocca', cantidad: 4 },
    ]);
    expect(r.preguntasAnteriores).toEqual([]);
  });
});

describe('construirResultados: denominadores', () => {
  it('"posibles" cuenta solo las respuestas de versiones donde la pregunta existía', () => {
    const nueva: Pregunta = { id: 'nueva', tipo: 'texto_corto', texto: 'Nueva', obligatoria: false };
    const r = construirResultados(
      [version(1, [favorito(['A', 'B'])]), version(2, [favorito(['A', 'B']), nueva])],
      crudos({
        total: 100,
        porVersion: [
          { version: 1, cantidad: 90 },
          { version: 2, cantidad: 10 },
        ],
        respondidas: [{ version: 2, preguntaId: 'nueva', cantidad: 8 }],
      }),
      'todas',
    );

    expect(de(r.preguntas, 'nueva', 'texto_corto')).toMatchObject({ versiones: [2], respondieron: 8, posibles: 10 });
    expect(de(r.preguntas, 'fav', 'opcion_unica')).toMatchObject({ versiones: [1, 2], posibles: 100 });
  });
});

describe('construirResultados: escala', () => {
  it('calcula un promedio PONDERADO entre versiones, no el promedio de los promedios', () => {
    // v1: 2 respuestas con promedio 5; v2: 100 respuestas con promedio 3.
    // Promedio de promedios = 4 (incorrecto). Ponderado = (10 + 300) / 102 = 3.04.
    const r = construirResultados(
      [version(1, [nota()]), version(2, [{ ...nota(), texto: 'Nota' }, favorito(['A', 'B'])])],
      crudos({
        escalas: [
          { version: 1, preguntaId: 'nota', suma: 10, cantidad: 2 },
          { version: 2, preguntaId: 'nota', suma: 300, cantidad: 100 },
        ],
      }),
      'todas',
    );

    expect(de(r.preguntas, 'nota', 'escala')).toMatchObject({ promedio: 3.04, advertencia: null });
  });

  it('arma la distribución completa del rango, con 0 en los valores sin respuestas', () => {
    const r = construirResultados(
      [version(1, [nota()])],
      crudos({
        conteos: [
          { version: 1, preguntaId: 'nota', valor: 5, cantidad: 2 },
          { version: 1, preguntaId: 'nota', valor: 1, cantidad: 1 },
        ],
        escalas: [{ version: 1, preguntaId: 'nota', suma: 11, cantidad: 3 }],
      }),
      'todas',
    );

    expect(de(r.preguntas, 'nota', 'escala')).toMatchObject({
      promedio: 3.67,
      distribucion: [
        { valor: 1, cantidad: 1 },
        { valor: 2, cantidad: 0 },
        { valor: 3, cantidad: 0 },
        { valor: 4, cantidad: 0 },
        { valor: 5, cantidad: 2 },
      ],
    });
  });

  it('si el rango cambió, combina solo las versiones con el rango vigente y lo advierte', () => {
    const r = construirResultados(
      [version(1, [nota(1, 5)]), version(2, [nota(1, 10)])],
      crudos({
        conteos: [
          { version: 1, preguntaId: 'nota', valor: 5, cantidad: 4 },
          { version: 2, preguntaId: 'nota', valor: 10, cantidad: 1 },
        ],
        escalas: [
          { version: 1, preguntaId: 'nota', suma: 20, cantidad: 4 },
          { version: 2, preguntaId: 'nota', suma: 10, cantidad: 1 },
        ],
      }),
      'todas',
    );

    const estadistica = de(r.preguntas, 'nota', 'escala');
    expect(estadistica).toMatchObject({ minimo: 1, maximo: 10, promedio: 10 });
    expect(estadistica.distribucion.find((d) => d.valor === 5)?.cantidad).toBe(0); // la v1 no se mezcla
    expect(estadistica.advertencia).toBe(
      'El rango cambió entre versiones: solo se combinan las versiones con rango 1–10; quedaron fuera 4 respuestas',
    );
  });

  it('sin respuestas, el promedio es null', () => {
    const r = construirResultados([version(1, [nota()])], vacios, 'todas');

    expect(de(r.preguntas, 'nota', 'escala').promedio).toBeNull();
  });
});

describe('construirResultados: fecha y texto', () => {
  it('fecha: primera y última entre todas las versiones', () => {
    const fecha: Pregunta = { id: 'f', tipo: 'fecha', texto: 'Fecha', obligatoria: false };
    const r = construirResultados(
      [version(1, [fecha]), version(2, [fecha])],
      crudos({
        fechas: [
          { version: 1, preguntaId: 'f', primera: '2026-03-01', ultima: '2026-05-01' },
          { version: 2, preguntaId: 'f', primera: '2025-12-24', ultima: '2026-04-01' },
        ],
      }),
      'todas',
    );

    expect(de(r.preguntas, 'f', 'fecha')).toMatchObject({ primera: '2025-12-24', ultima: '2026-05-01' });
  });

  it('texto: devuelve los últimos textos que entregó la agregación', () => {
    const comentario: Pregunta = { id: 'c', tipo: 'texto_largo', texto: 'Comentarios', obligatoria: false };
    const ultimos = [{ valor: 'Muy bueno', enviadaEn: new Date('2026-09-25T10:00:00Z') }];

    const r = construirResultados([version(1, [comentario])], crudos({ textos: [{ preguntaId: 'c', ultimos }] }), 'todas');

    expect(de(r.preguntas, 'c', 'texto_largo').ultimos).toEqual(ultimos);
  });
});

describe('construirResultados: preguntas de versiones anteriores', () => {
  it('lista aparte las preguntas eliminadas, con su última definición', () => {
    const r = construirResultados(
      [version(1, [favorito(['A', 'B'], 'Texto v1')]), version(2, [favorito(['A', 'B'], 'Texto v2')]), version(3, [nota()])],
      crudos({ conteos: [{ version: 1, preguntaId: 'fav', valor: 'A', cantidad: 2 }] }),
      'todas',
    );

    expect(r.preguntas.map((p) => p.id)).toEqual(['nota']);
    expect(r.preguntasAnteriores).toEqual([
      expect.objectContaining({ id: 'fav', texto: 'Texto v2', versiones: [1, 2] }),
    ]);
  });
});

describe('idsPorTipo', () => {
  it('agrupa los ids de todas las versiones por tipo, sin repetir', () => {
    const ids = idsPorTipo([version(1, [favorito(['A', 'B']), nota()]), version(2, [favorito(['A', 'C'])])]);

    expect(ids.get('opcion_unica')).toEqual(['fav']);
    expect(ids.get('escala')).toEqual(['nota']);
  });
});

describe('completarDias', () => {
  it('rellena con 0 los días sin respuestas entre el primero y el último', () => {
    expect(
      completarDias([
        { dia: '2026-09-28', cantidad: 1 },
        { dia: '2026-09-25', cantidad: 3 },
      ]),
    ).toEqual([
      { dia: '2026-09-25', cantidad: 3 },
      { dia: '2026-09-26', cantidad: 0 },
      { dia: '2026-09-27', cantidad: 0 },
      { dia: '2026-09-28', cantidad: 1 },
    ]);
  });

  it('cruza fin de mes y año bisiesto correctamente', () => {
    const dias = completarDias([
      { dia: '2028-02-28', cantidad: 1 },
      { dia: '2028-03-01', cantidad: 1 },
    ]).map((d) => d.dia);

    expect(dias).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });

  it('no se altera con el cambio de horario de Chile (primer sábado de septiembre)', () => {
    const dias = completarDias([
      { dia: '2026-09-05', cantidad: 1 },
      { dia: '2026-09-07', cantidad: 1 },
    ]).map((d) => d.dia);

    expect(dias).toEqual(['2026-09-05', '2026-09-06', '2026-09-07']);
  });

  it('con una lista vacía devuelve una lista vacía', () => {
    expect(completarDias([])).toEqual([]);
  });
});
