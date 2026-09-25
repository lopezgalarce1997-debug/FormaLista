import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearAppDePrueba } from '../dobles/crearAppDePrueba.js';

describe('Versionado de punta a punta (HTTP)', () => {
  it('publicar → responder → editar → responder con la versión nueva y con la antigua', async () => {
    const app = crearAppDePrueba();
    const { body: auth } = await request(app)
      .post('/api/auth/registro')
      .send({ nombre: 'Ana', email: 'ana@correo.cl', password: 'secreta123' });
    const conToken = (req: request.Test) => req.set('Authorization', `Bearer ${auth.token}`);

    const { body: f } = await conToken(request(app).post('/api/formularios')).send({
      titulo: 'Café',
      preguntas: [{ id: 'favorito', tipo: 'opcion_unica', texto: '¿Favorito?', obligatoria: true, opciones: ['Latte', 'Mocca'] }],
    });
    await conToken(request(app).post(`/api/formularios/${f.id}/publicar`));
    const { body: publicoV1 } = await request(app).get(`/api/publico/${f.slug}`);

    // Edición: se reemplaza la pregunta → versión 2
    const editado = await conToken(request(app).put(`/api/formularios/${f.id}`)).send({
      titulo: 'Café',
      version: 1,
      preguntas: [{ id: 'nota', tipo: 'escala', texto: 'Nota', obligatoria: true }],
    });
    expect(editado.status).toBe(200);
    expect(editado.body.version).toBe(2);

    // El GET público ahora muestra la v2
    expect((await request(app).get(`/api/publico/${f.slug}`)).body).toMatchObject({ version: 2 });

    // Responder la v2 (sin indicar versión) y la v1 (quien la tenía abierta)
    const nueva = await request(app).post(`/api/publico/${f.slug}/respuestas`).send({ respuestas: { nota: 4 } });
    const antigua = await request(app)
      .post(`/api/publico/${f.slug}/respuestas`)
      .send({ respuestas: { favorito: 'Mocca' }, version: publicoV1.version });
    expect([nueva.status, antigua.status]).toEqual([201, 201]);

    // Editar con una versión desactualizada → 409
    const pisada = await conToken(request(app).put(`/api/formularios/${f.id}`)).send({ titulo: 'Pisado', version: 1 });
    expect(pisada.status).toBe(409);
  });

  it('PUT sin version responde 400', async () => {
    const app = crearAppDePrueba();
    const { body: auth } = await request(app)
      .post('/api/auth/registro')
      .send({ nombre: 'Ana', email: 'ana@correo.cl', password: 'secreta123' });
    const { body: f } = await request(app)
      .post('/api/formularios')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({ titulo: 'x' });

    const res = await request(app)
      .put(`/api/formularios/${f.id}`)
      .set('Authorization', `Bearer ${auth.token}`)
      .send({ titulo: 'y' });

    expect(res.status).toBe(400);
    expect(res.body.detalles).toEqual([
      { campo: 'version', mensaje: 'Es obligatoria (la versión que estabas editando)' },
    ]);
  });
});
