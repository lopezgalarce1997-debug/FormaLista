import { describe, expect, it } from 'vitest';
import { ServicioFormularios, type DatosFormulario } from '../../src/application/servicioFormularios.js';
import { ServicioPublico } from '../../src/application/servicioPublico.js';
import { ServicioResultados } from '../../src/application/servicioResultados.js';
import { FormulariosEnMemoria, RegistroEnMemoria, RespuestasEnMemoria } from '../dobles/formulariosEnMemoria.js';

const ANA = 1;
const BETO = 2;

const v1: DatosFormulario = {
  titulo: 'Café',
  descripcion: '',
  preguntas: [
    { id: 'fav', tipo: 'opcion_unica', texto: '¿Favorito?', obligatoria: true, opciones: ['Latte', 'Mocca'] },
    { id: 'nota', tipo: 'escala', texto: 'Nota', obligatoria: false, minimo: 1, maximo: 5 },
    { id: 'coment', tipo: 'texto_largo', texto: 'Comentarios', obligatoria: false },
    { id: 'visita', tipo: 'fecha', texto: 'Visita', obligatoria: false },
  ],
};

async function crearEscenario() {
  const registro = new RegistroEnMemoria();
  const formularios = new FormulariosEnMemoria();
  const respuestas = new RespuestasEnMemoria();
  const servicio = new ServicioFormularios(registro, formularios, respuestas, { error: () => {} });
  const publico = new ServicioPublico(registro, formularios, respuestas);
  const resultados = new ServicioResultados(registro, formularios, respuestas, { error: () => {} });

  const f = await servicio.crear(ANA, v1);
  await servicio.publicar(ANA, f.id);
  return { servicio, publico, resultados, respuestas, id: f.id, slug: f.slug };
}

describe('ServicioResultados.obtenerResultados', () => {
  it('pide a la agregación los ids agrupados por tipo y la zona horaria', async () => {
    const { resultados, respuestas, id } = await crearEscenario();

    await resultados.obtenerResultados(ANA, id, { version: 'todas', zona: 'America/Santiago' });

    expect(respuestas.ultimaConsulta).toEqual({
      formularioId: id,
      version: undefined,
      zona: 'America/Santiago',
      idsConteo: ['fav', 'nota'],
      idsEscala: ['nota'],
      idsFecha: ['visita'],
      idsTexto: ['coment'],
    });
  });

  it('con una versión elegida, filtra la agregación por esa versión', async () => {
    const { servicio, resultados, respuestas, id } = await crearEscenario();
    await servicio.actualizar(ANA, id, { ...v1, preguntas: v1.preguntas.slice(0, 1), version: 1 });

    const r = await resultados.obtenerResultados(ANA, id, { version: 1, zona: 'UTC' });

    expect(respuestas.ultimaConsulta?.version).toBe(1);
    expect(r.preguntas).toHaveLength(4); // las preguntas de la v1, no las de la v2
  });

  it('combina los agregados con las definiciones del historial', async () => {
    const { resultados, respuestas, id } = await crearEscenario();
    respuestas.crudosSimulados = {
      ...respuestas.crudosSimulados,
      total: 2,
      porVersion: [{ version: 1, cantidad: 2 }],
      conteos: [{ version: 1, preguntaId: 'fav', valor: 'Latte', cantidad: 2 }],
    };

    const r = await resultados.obtenerResultados(ANA, id, { version: 'todas', zona: 'UTC' });

    expect(r.preguntas[0]).toMatchObject({
      id: 'fav',
      opciones: [
        { valor: 'Latte', cantidad: 2 },
        { valor: 'Mocca', cantidad: 0 },
      ],
    });
  });

  it('rechaza una versión que no existe', async () => {
    const { resultados, id } = await crearEscenario();

    await expect(resultados.obtenerResultados(ANA, id, { version: 9, zona: 'UTC' })).rejects.toMatchObject({
      tipo: 'validacion',
      detalles: [{ campo: 'version', mensaje: 'No existe la versión 9' }],
    });
  });

  it('no permite ver resultados de un formulario ajeno', async () => {
    const { resultados, id } = await crearEscenario();

    await expect(resultados.obtenerResultados(BETO, id, { version: 'todas', zona: 'UTC' })).rejects.toMatchObject({
      tipo: 'no_encontrado',
    });
  });
});

describe('ServicioResultados.listarRespuestas', () => {
  it('pagina de a N, más recientes primero, con el texto de la pregunta de SU versión', async () => {
    const { servicio, publico, resultados, id, slug } = await crearEscenario();
    await publico.responder(slug, { fav: 'Latte' }); // v1
    await servicio.actualizar(ANA, id, {
      ...v1,
      preguntas: [{ ...v1.preguntas[0]!, texto: '¿Cuál prefieres?' } as DatosFormulario['preguntas'][number]],
      version: 1,
    });
    await publico.responder(slug, { fav: 'Mocca' }); // v2
    await publico.responder(slug, { fav: 'Latte' }); // v2

    const primera = await resultados.listarRespuestas(ANA, id, { version: 'todas', pagina: 1, tamano: 2 });
    const segunda = await resultados.listarRespuestas(ANA, id, { version: 'todas', pagina: 2, tamano: 2 });

    expect(primera).toMatchObject({ pagina: 1, tamano: 2, total: 3, totalPaginas: 2 });
    expect(primera.respuestas).toHaveLength(2);
    expect(segunda.respuestas).toEqual([
      expect.objectContaining({
        version: 1,
        respuestas: [{ preguntaId: 'fav', pregunta: '¿Favorito?', tipo: 'opcion_unica', valor: 'Latte' }],
      }),
    ]);
    expect(primera.respuestas[0]?.respuestas[0]?.pregunta).toBe('¿Cuál prefieres?');
  });

  it('filtra por versión', async () => {
    const { servicio, publico, resultados, id, slug } = await crearEscenario();
    await publico.responder(slug, { fav: 'Latte' });
    await servicio.actualizar(ANA, id, { ...v1, preguntas: v1.preguntas.slice(0, 1), version: 1 });
    await publico.responder(slug, { fav: 'Mocca' });

    const soloV2 = await resultados.listarRespuestas(ANA, id, { version: 2, pagina: 1, tamano: 20 });

    expect(soloV2.total).toBe(1);
    expect(soloV2.respuestas[0]?.version).toBe(2);
  });

  it('una página vacía devuelve la lista vacía con el total real', async () => {
    const { publico, resultados, id, slug } = await crearEscenario();
    await publico.responder(slug, { fav: 'Latte' });

    const r = await resultados.listarRespuestas(ANA, id, { version: 'todas', pagina: 5, tamano: 20 });

    expect(r).toMatchObject({ total: 1, totalPaginas: 1, respuestas: [] });
  });
});
