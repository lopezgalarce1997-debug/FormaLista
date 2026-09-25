import { describe, expect, it } from 'vitest';
import { aCuerpoApi, aEditable, preguntaNueva, rutaEnFormulario } from '../src/paginas/editor/modelo';
import { detalleDePrueba } from './servidor';

describe('modelo del editor', () => {
  it('aCuerpoApi envía solo los campos que corresponden a cada tipo, y el id solo si existe', () => {
    const cuerpo = aCuerpoApi(
      {
        titulo: 'T',
        descripcion: '',
        preguntas: [
          { ...preguntaNueva('texto_corto'), id: 'p1', texto: 'Nombre', opciones: [{ texto: 'quedó de antes' }] },
          { ...preguntaNueva('opcion_multiple'), texto: 'Extras' },
          { ...preguntaNueva('escala'), texto: 'Nota', minimo: 0, maximo: 10 },
        ],
      },
      3,
    );

    expect(cuerpo).toEqual({
      titulo: 'T',
      descripcion: '',
      version: 3,
      preguntas: [
        { id: 'p1', tipo: 'texto_corto', texto: 'Nombre', obligatoria: false },
        { tipo: 'opcion_multiple', texto: 'Extras', obligatoria: false, opciones: ['Opción 1', 'Opción 2'] },
        { tipo: 'escala', texto: 'Nota', obligatoria: false, minimo: 0, maximo: 10 },
      ],
    });
  });

  it('aEditable → aCuerpoApi conserva el formulario de la API (ida y vuelta)', () => {
    const detalle = detalleDePrueba({
      version: 2,
      preguntas: [
        { id: 'a', tipo: 'opcion_unica', texto: '¿Favorito?', obligatoria: true, opciones: ['Latte', 'Mocca'] },
        { id: 'b', tipo: 'escala', texto: 'Nota', obligatoria: false, minimo: 1, maximo: 7 },
        { id: 'c', tipo: 'fecha', texto: 'Visita', obligatoria: false },
      ],
    });

    const { preguntas } = aCuerpoApi(aEditable(detalle), detalle.version);

    expect(preguntas).toEqual(detalle.preguntas);
  });

  it.each([
    [['titulo'], 'titulo'],
    [['preguntas', 2, 'texto'], 'preguntas.2.texto'],
    [['preguntas', 1, 'opciones', 0], 'preguntas.1.opciones.0.texto'],
    [['preguntas', 1, 'opciones'], 'preguntas.1.opciones.root'],
    [['preguntas'], 'preguntas.root'],
    [['version'], 'root.servidor'],
  ] as const)('rutaEnFormulario %j → %s', (ruta, esperada) => {
    expect(rutaEnFormulario(ruta)).toBe(esperada);
  });
});
