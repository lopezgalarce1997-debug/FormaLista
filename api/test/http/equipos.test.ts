import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearAppDePrueba } from '../dobles/crearAppDePrueba.js';

type App = ReturnType<typeof crearAppDePrueba>;

async function registrar(app: App, nombre: string) {
  const { body } = await request(app)
    .post('/api/auth/registro')
    .send({ nombre, email: `${nombre.toLowerCase()}@correo.cl`, password: 'secreta123' });
  const como = (req: request.Test) => req.set('Authorization', `Bearer ${body.token}`);
  return { id: body.usuario.id as number, como };
}

describe('Equipos, roles y compartir (HTTP, tres usuarios)', () => {
  let app: App;
  let ana: Awaited<ReturnType<typeof registrar>>;
  let beto: Awaited<ReturnType<typeof registrar>>;
  let carla: Awaited<ReturnType<typeof registrar>>;

  beforeEach(async () => {
    app = crearAppDePrueba();
    [ana, beto, carla] = [await registrar(app, 'Ana'), await registrar(app, 'Beto'), await registrar(app, 'Carla')];
  });

  it('flujo completo: crear equipo, agregar miembros, compartir y aplicar permisos por rol', async () => {
    const { body: equipo } = await ana.como(request(app).post('/api/equipos')).send({ nombre: 'Marketing' });
    expect(equipo).toMatchObject({ nombre: 'Marketing', rol: 'propietario' });

    const agregado = await ana.como(request(app).post(`/api/equipos/${equipo.id}/miembros`)).send({ email: 'beto@correo.cl', rol: 'editor' });
    await ana.como(request(app).post(`/api/equipos/${equipo.id}/miembros`)).send({ email: 'carla@correo.cl', rol: 'lector' });
    expect(agregado.status).toBe(201);

    const { body: f } = await ana.como(request(app).post('/api/formularios')).send({
      titulo: 'Café',
      preguntas: [{ tipo: 'escala', texto: 'Nota' }],
    });
    const compartido = await ana.como(request(app).post(`/api/formularios/${f.id}/compartir`)).send({ equipoId: equipo.id });
    expect(compartido.body).toMatchObject({ rol: 'propietario', equipo: { id: equipo.id, nombre: 'Marketing' } });

    // Beto (editor) edita; Carla (lectora) no puede → 403
    const editaBeto = await beto.como(request(app).put(`/api/formularios/${f.id}`)).send({ titulo: 'Café 2', version: 1 });
    const editaCarla = await carla.como(request(app).put(`/api/formularios/${f.id}`)).send({ titulo: 'x', version: 1 });
    expect(editaBeto.status).toBe(200);
    expect(editaCarla.status).toBe(403);
    expect(editaCarla.body).toEqual({ error: 'Tu rol (lector) no permite editar este formulario' });

    // Carla sí ve los resultados; Beto no puede borrar
    expect((await carla.como(request(app).get(`/api/formularios/${f.id}/resultados`))).status).toBe(200);
    expect((await beto.como(request(app).delete(`/api/formularios/${f.id}`))).status).toBe(403);

    // El listado de Carla incluye el formulario compartido con su rol
    const { body: lista } = await carla.como(request(app).get('/api/formularios'));
    expect(lista.formularios).toEqual([expect.objectContaining({ id: f.id, rol: 'lector' })]);
  });

  it('GET /api/equipos lista mis equipos; un no miembro recibe 404 en el detalle', async () => {
    const { body: equipo } = await ana.como(request(app).post('/api/equipos')).send({ nombre: 'Ventas' });

    const { body: mios } = await ana.como(request(app).get('/api/equipos'));
    expect(mios.equipos).toEqual([expect.objectContaining({ nombre: 'Ventas', rol: 'propietario', cantidadMiembros: 1 })]);
    expect((await beto.como(request(app).get(`/api/equipos/${equipo.id}`))).status).toBe(404);
  });

  it('PATCH cambia el rol, DELETE quita (o permite salir) y se protege al último propietario', async () => {
    const { body: equipo } = await ana.como(request(app).post('/api/equipos')).send({ nombre: 'Ventas' });
    await ana.como(request(app).post(`/api/equipos/${equipo.id}/miembros`)).send({ email: 'beto@correo.cl', rol: 'lector' });

    const cambio = await ana.como(request(app).patch(`/api/equipos/${equipo.id}/miembros/${beto.id}`)).send({ rol: 'editor' });
    expect(cambio.body.miembros).toEqual(expect.arrayContaining([expect.objectContaining({ usuarioId: beto.id, rol: 'editor' })]));

    const ultimo = await ana.como(request(app).delete(`/api/equipos/${equipo.id}/miembros/${ana.id}`));
    expect(ultimo.status).toBe(409);

    const sale = await beto.como(request(app).delete(`/api/equipos/${equipo.id}/miembros/${beto.id}`));
    expect(sale.status).toBe(204);
  });

  it.each([
    ['sin nombre', '/api/equipos', {}],
    ['rol inválido', '/api/equipos/1/miembros', { email: 'beto@correo.cl', rol: 'admin' }],
    ['email inválido', '/api/equipos/1/miembros', { email: 'no', rol: 'lector' }],
  ])('responde 400 con datos inválidos (%s)', async (_caso, ruta, body) => {
    await ana.como(request(app).post('/api/equipos')).send({ nombre: 'Ventas' });

    expect((await ana.como(request(app).post(ruta)).send(body)).status).toBe(400);
  });

  it('agregar un email no registrado responde 404', async () => {
    const { body: equipo } = await ana.como(request(app).post('/api/equipos')).send({ nombre: 'Ventas' });

    const res = await ana.como(request(app).post(`/api/equipos/${equipo.id}/miembros`)).send({ email: 'nadie@correo.cl', rol: 'lector' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'No existe un usuario con ese email' });
  });

  it('un id de equipo no numérico responde 404', async () => {
    expect((await ana.como(request(app).get('/api/equipos/abc'))).status).toBe(404);
  });

  it('compartir exige equipoId explícito (número o null)', async () => {
    const { body: f } = await ana.como(request(app).post('/api/formularios')).send({ titulo: 'x' });

    expect((await ana.como(request(app).post(`/api/formularios/${f.id}/compartir`)).send({})).status).toBe(400);
    expect((await ana.como(request(app).post(`/api/formularios/${f.id}/compartir`)).send({ equipoId: null })).status).toBe(200);
  });
});
