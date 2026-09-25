import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearEntornoDePrueba } from '../dobles/crearAppDePrueba.js';

describe('API de resultados', () => {
  let entorno: ReturnType<typeof crearEntornoDePrueba>;
  let token: string;
  let id: string;

  beforeEach(async () => {
    entorno = crearEntornoDePrueba();
    const { body: auth } = await request(entorno.app)
      .post('/api/auth/registro')
      .send({ nombre: 'Ana', email: 'ana@correo.cl', password: 'secreta123' });
    token = auth.token;
    const { body: f } = await request(entorno.app)
      .post('/api/formularios')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Café', preguntas: [{ id: 'nota', tipo: 'escala', texto: 'Nota' }] });
    id = f.id;
  });

  const get = (ruta: string) => request(entorno.app).get(ruta).set('Authorization', `Bearer ${token}`);

  it('GET /resultados usa por defecto todas las versiones y America/Santiago', async () => {
    const res = await get(`/api/formularios/${id}/resultados`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: 'todas', total: 0, preguntas: [{ id: 'nota', tipo: 'escala' }] });
    expect(entorno.respuestas.ultimaConsulta).toMatchObject({ zona: 'America/Santiago', version: undefined });
  });

  it('GET /resultados?version=1&zona=UTC convierte y pasa los parámetros', async () => {
    const res = await get(`/api/formularios/${id}/resultados?version=1&zona=UTC`);

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(entorno.respuestas.ultimaConsulta).toMatchObject({ zona: 'UTC', version: 1 });
  });

  it.each([
    ['version inválida', 'version=ultima', 'version'],
    ['version 0', 'version=0', 'version'],
    ['zona desconocida', 'zona=Marte/Olympus', 'zona'],
  ])('GET /resultados responde 400 con %s', async (_caso, query, campo) => {
    const res = await get(`/api/formularios/${id}/resultados?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.detalles.map((d: { campo: string }) => d.campo)).toContain(campo);
  });

  it('GET /respuestas aplica los valores por defecto de paginación', async () => {
    const res = await get(`/api/formularios/${id}/respuestas`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pagina: 1, tamano: 20, total: 0, totalPaginas: 0, respuestas: [] });
  });

  it.each(['tamano=101', 'tamano=0', 'pagina=0', 'pagina=abc'])('GET /respuestas responde 400 con %s', async (query) => {
    expect((await get(`/api/formularios/${id}/respuestas?${query}`)).status).toBe(400);
  });

  it('exige autenticación y no muestra resultados de formularios ajenos', async () => {
    const { body: beto } = await request(entorno.app)
      .post('/api/auth/registro')
      .send({ nombre: 'Beto', email: 'beto@correo.cl', password: 'secreta123' });

    expect((await request(entorno.app).get(`/api/formularios/${id}/resultados`)).status).toBe(401);
    expect(
      (await request(entorno.app).get(`/api/formularios/${id}/resultados`).set('Authorization', `Bearer ${beto.token}`))
        .status,
    ).toBe(404);
  });
});
