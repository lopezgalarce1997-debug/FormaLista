import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import type { ConsultaEstadisticas } from '../../src/application/puertos.js';
import { ModeloRespuesta } from '../../src/infrastructure/mongo/modelos.js';
import { RepositorioRespuestasMongo } from '../../src/infrastructure/mongo/repositorioRespuestasMongo.js';
import { usarMongoEnMemoria } from './mongo.js';

usarMongoEnMemoria();

const repo = new RepositorioRespuestasMongo();
const formularioId = new Types.ObjectId().toString();
const otroFormulario = new Types.ObjectId().toString();

/** Inserta una respuesta directamente (con fecha controlada) sin pasar por el dominio. */
function insertar(version: number, enviadaEn: string, respuestas: Record<string, unknown>, formulario = formularioId) {
  return ModeloRespuesta.create({
    formularioId: formulario,
    version,
    enviadaEn: new Date(enviadaEn),
    respuestas: Object.entries(respuestas).map(([preguntaId, valor]) => ({ preguntaId, valor })),
  });
}

const consulta = (cambios: Partial<ConsultaEstadisticas> = {}): ConsultaEstadisticas => ({
  formularioId,
  zona: 'America/Santiago',
  idsConteo: ['fav', 'extras', 'nota'],
  idsEscala: ['nota'],
  idsFecha: ['visita'],
  idsTexto: ['coment'],
  ...cambios,
});

describe('RepositorioRespuestasMongo.agregarEstadisticas (MongoDB real)', () => {
  it('cuenta totales, por versión, respondidas y valores (con opción múltiple desenrollada)', async () => {
    await insertar(1, '2026-09-24T15:00:00Z', { fav: 'Latte', extras: ['Azúcar', 'Canela'], nota: 5 });
    await insertar(1, '2026-09-24T16:00:00Z', { fav: 'Mocca', extras: ['Azúcar'], nota: 3 });
    await insertar(2, '2026-09-25T15:00:00Z', { fav: 'Latte' });
    await insertar(1, '2026-09-24T15:00:00Z', { fav: 'Latte' }, otroFormulario); // no debe contarse

    const r = await repo.agregarEstadisticas(consulta());

    expect(r.total).toBe(3);
    expect(r.porVersion).toEqual(
      expect.arrayContaining([
        { version: 1, cantidad: 2 },
        { version: 2, cantidad: 1 },
      ]),
    );
    expect(r.respondidas).toEqual(
      expect.arrayContaining([
        { version: 1, preguntaId: 'fav', cantidad: 2 },
        { version: 2, preguntaId: 'fav', cantidad: 1 },
        { version: 1, preguntaId: 'extras', cantidad: 2 },
      ]),
    );
    expect(r.conteos).toEqual(
      expect.arrayContaining([
        { version: 1, preguntaId: 'fav', valor: 'Latte', cantidad: 1 },
        { version: 2, preguntaId: 'fav', valor: 'Latte', cantidad: 1 },
        { version: 1, preguntaId: 'extras', valor: 'Azúcar', cantidad: 2 },
        { version: 1, preguntaId: 'extras', valor: 'Canela', cantidad: 1 },
        { version: 1, preguntaId: 'nota', valor: 5, cantidad: 1 },
      ]),
    );
  });

  it('suma y cuenta las escalas por versión (base del promedio ponderado)', async () => {
    await insertar(1, '2026-09-24T15:00:00Z', { nota: 5 });
    await insertar(1, '2026-09-24T15:00:00Z', { nota: 4 });
    await insertar(2, '2026-09-24T15:00:00Z', { nota: 1 });

    const r = await repo.agregarEstadisticas(consulta());

    expect(r.escalas).toEqual(
      expect.arrayContaining([
        { version: 1, preguntaId: 'nota', suma: 9, cantidad: 2 },
        { version: 2, preguntaId: 'nota', suma: 1, cantidad: 1 },
      ]),
    );
  });

  it('agrupa por día LOCAL: 23:30 en Chile sigue siendo el mismo día, aunque en UTC ya sea el siguiente', async () => {
    await insertar(1, '2026-09-25T02:30:00Z', { fav: 'Latte' }); // 24-09 23:30 en Santiago (UTC-3)
    await insertar(1, '2026-09-25T12:00:00Z', { fav: 'Latte' }); // 25-09 09:00 en Santiago

    const chile = await repo.agregarEstadisticas(consulta());
    const utc = await repo.agregarEstadisticas(consulta({ zona: 'UTC' }));

    expect(chile.porDia).toEqual(
      expect.arrayContaining([
        { dia: '2026-09-24', cantidad: 1 },
        { dia: '2026-09-25', cantidad: 1 },
      ]),
    );
    expect(utc.porDia).toEqual([{ dia: '2026-09-25', cantidad: 2 }]);
  });

  it('fechas: la primera y la última respondida por versión', async () => {
    await insertar(1, '2026-09-24T15:00:00Z', { visita: '2026-03-10' });
    await insertar(1, '2026-09-24T15:00:00Z', { visita: '2025-12-24' });
    await insertar(1, '2026-09-24T15:00:00Z', { visita: '2026-08-01' });

    const r = await repo.agregarEstadisticas(consulta());

    expect(r.fechas).toEqual([{ version: 1, preguntaId: 'visita', primera: '2025-12-24', ultima: '2026-08-01' }]);
  });

  it('textos: solo los 5 más recientes por pregunta ($topN)', async () => {
    for (let i = 1; i <= 7; i++) {
      await insertar(1, `2026-09-2${i}T12:00:00Z`, { coment: `comentario ${i}` });
    }

    const r = await repo.agregarEstadisticas(consulta());

    expect(r.textos).toHaveLength(1);
    expect(r.textos[0]!.ultimos.map((u) => u.valor)).toEqual([
      'comentario 7',
      'comentario 6',
      'comentario 5',
      'comentario 4',
      'comentario 3',
    ]);
  });

  it('filtra por versión cuando se indica', async () => {
    await insertar(1, '2026-09-24T15:00:00Z', { fav: 'Latte' });
    await insertar(2, '2026-09-24T15:00:00Z', { fav: 'Mocca' });

    const r = await repo.agregarEstadisticas(consulta({ version: 2 }));

    expect(r.total).toBe(1);
    expect(r.conteos).toEqual([{ version: 2, preguntaId: 'fav', valor: 'Mocca', cantidad: 1 }]);
  });

  it('sin respuestas devuelve todo vacío y total 0', async () => {
    const r = await repo.agregarEstadisticas(consulta());

    expect(r).toEqual({
      total: 0,
      porVersion: [],
      porDia: [],
      respondidas: [],
      conteos: [],
      escalas: [],
      fechas: [],
      textos: [],
    });
  });

  it('usa el índice compuesto para filtrar por formulario y versión', async () => {
    await insertar(1, '2026-09-24T15:00:00Z', { fav: 'Latte' });

    const plan = await ModeloRespuesta.find({ formularioId, version: 1 }).sort({ enviadaEn: -1 }).explain('queryPlanner');

    expect(JSON.stringify(plan)).toContain('formularioId_1_version_1_enviadaEn_-1');
  });
});

describe('RepositorioRespuestasMongo.listar (MongoDB real)', () => {
  it('pagina con más recientes primero y devuelve el total', async () => {
    for (let i = 1; i <= 5; i++) {
      await insertar(1, `2026-09-2${i}T12:00:00Z`, { fav: `v${i}` });
    }

    const pagina1 = await repo.listar({ formularioId }, { saltar: 0, limite: 2 });
    const pagina3 = await repo.listar({ formularioId }, { saltar: 4, limite: 2 });

    expect(pagina1.total).toBe(5);
    expect(pagina1.respuestas.map((r) => r.respuestas[0]!.valor)).toEqual(['v5', 'v4']);
    expect(pagina3.respuestas.map((r) => r.respuestas[0]!.valor)).toEqual(['v1']);
    expect(pagina1.respuestas[0]).toMatchObject({ formularioId, version: 1, enviadaEn: expect.any(Date) });
  });

  it('filtra por versión', async () => {
    await insertar(1, '2026-09-24T15:00:00Z', { fav: 'a' });
    await insertar(2, '2026-09-24T16:00:00Z', { fav: 'b' });

    const r = await repo.listar({ formularioId, version: 2 }, { saltar: 0, limite: 10 });

    expect(r.total).toBe(1);
    expect(r.respuestas[0]!.version).toBe(2);
  });
});
