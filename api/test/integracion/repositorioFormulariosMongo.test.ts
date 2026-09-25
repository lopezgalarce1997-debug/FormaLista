import { describe, expect, it } from 'vitest';
import type { Pregunta } from '@formalista/compartido';
import { ModeloFormulario } from '../../src/infrastructure/mongo/modelos.js';
import { RepositorioFormulariosMongo } from '../../src/infrastructure/mongo/repositorioFormulariosMongo.js';
import { usarMongoEnMemoria } from './mongo.js';

usarMongoEnMemoria();

// Lo que los dobles en memoria solo IMITAN (paso 8): aquí se prueba contra MongoDB real.
const repo = new RepositorioFormulariosMongo();

const v1: Pregunta[] = [{ id: 'fav', tipo: 'opcion_unica', texto: 'v1', obligatoria: false, opciones: ['A', 'B'] }];
const v2: Pregunta[] = [{ id: 'nota', tipo: 'escala', texto: 'v2', obligatoria: true, minimo: 1, maximo: 5 }];

async function crear() {
  return repo.crear({ titulo: 'Café', descripcion: '', preguntas: v1, slug: `cafe-${Math.random().toString(36).slice(2, 10)}` });
}

describe('RepositorioFormulariosMongo.actualizar (MongoDB real)', () => {
  it('archiva la versión anterior y sube la versión en una sola operación', async () => {
    const f = await crear();

    const actualizado = await repo.actualizar(f.id, { titulo: 'Café', descripcion: '', preguntas: v2 }, { versionEsperada: 1, archivar: v1 });

    expect(actualizado).toMatchObject({ version: 2, preguntas: v2 });
    expect(await repo.obtenerVersiones(f.id)).toEqual([
      { version: 1, preguntas: v1, reemplazadaEn: expect.any(Date) },
      { version: 2, preguntas: v2, reemplazadaEn: null },
    ]);
  });

  it('en el lugar: cambia el contenido sin tocar la versión ni el historial', async () => {
    const f = await crear();

    const actualizado = await repo.actualizar(f.id, { titulo: 'Otro', descripcion: '', preguntas: v1 }, { versionEsperada: 1, archivar: null });

    expect(actualizado).toMatchObject({ titulo: 'Otro', version: 1 });
    expect(await repo.obtenerVersiones(f.id)).toHaveLength(1);
  });

  it('concurrencia optimista: si la versión ya no es la esperada, no escribe y devuelve null', async () => {
    const f = await crear();
    await repo.actualizar(f.id, { titulo: 'Café', descripcion: '', preguntas: v2 }, { versionEsperada: 1, archivar: v1 });

    const pisada = await repo.actualizar(f.id, { titulo: 'Pisado', descripcion: '', preguntas: v1 }, { versionEsperada: 1, archivar: null });

    expect(pisada).toBeNull();
    expect((await repo.buscarPorId(f.id))?.titulo).toBe('Café');
  });

  it('dos ediciones simultáneas con la misma versión: exactamente una gana', async () => {
    const f = await crear();
    const editar = (titulo: string) =>
      repo.actualizar(f.id, { titulo, descripcion: '', preguntas: v2 }, { versionEsperada: 1, archivar: v1 });

    const resultados = await Promise.all([editar('A'), editar('B'), editar('C')]);

    expect(resultados.filter((r) => r !== null)).toHaveLength(1);
    expect(await repo.obtenerVersiones(f.id)).toHaveLength(2); // una sola versión archivada
  });

  it('las lecturas normales no traen el historial', async () => {
    const f = await crear();
    await repo.actualizar(f.id, { titulo: 'Café', descripcion: '', preguntas: v2 }, { versionEsperada: 1, archivar: v1 });

    const crudo = await ModeloFormulario.findById(f.id, { versiones: 0 }).lean();
    const leido = await repo.buscarPorId(f.id);

    expect(crudo).not.toHaveProperty('versiones');
    expect(leido).not.toHaveProperty('versiones');
  });
});
