import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearAppDePrueba } from '../dobles/crearAppDePrueba.js';

type App = ReturnType<typeof crearAppDePrueba>;

async function registrar(app: App, email: string): Promise<string> {
  const res = await request(app).post('/api/auth/registro').send({ nombre: 'Test', email, password: 'secreta123' });
  return res.body.token;
}

const cuerpo = {
  titulo: 'Encuesta de café',
  preguntas: [
    { tipo: 'texto_corto', texto: '¿Tu nombre?', obligatoria: true },
    { tipo: 'opcion_unica', texto: '¿Favorito?', opciones: ['Latte', 'Espresso'] },
    { tipo: 'escala', texto: 'Del 1 al 5' },
  ],
};

describe('API de formularios', () => {
  let app: App;
  let tokenAna: string;
  let tokenBeto: string;

  beforeEach(async () => {
    app = crearAppDePrueba();
    tokenAna = await registrar(app, 'ana@correo.cl');
    tokenBeto = await registrar(app, 'beto@correo.cl');
  });

  const comoAna = (req: request.Test) => req.set('Authorization', `Bearer ${tokenAna}`);

  it('exige autenticación', async () => {
    const res = await request(app).get('/api/formularios');

    expect(res.status).toBe(401);
  });

  it('POST crea el formulario (201) con valores por defecto y sin aceptar campos no permitidos', async () => {
    const res = await comoAna(request(app).post('/api/formularios')).send({ ...cuerpo, slug: 'hackeado', version: 99 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ titulo: 'Encuesta de café', descripcion: '', estado: 'borrador', version: 1 });
    expect(res.body.slug).toMatch(/^encuesta-de-cafe-[a-z0-9]{8}$/);
    expect(res.body.preguntas[1]).toMatchObject({ obligatoria: false, opciones: ['Latte', 'Espresso'] });
    expect(res.body.preguntas[2]).toMatchObject({ minimo: 1, maximo: 5 });
  });

  it('POST responde 400 si la forma es inválida (Zod)', async () => {
    const res = await comoAna(request(app).post('/api/formularios')).send({
      titulo: '',
      preguntas: [{ tipo: 'desconocido', texto: 'x' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.detalles.map((d: { campo: string }) => d.campo)).toEqual(
      expect.arrayContaining(['titulo', 'preguntas.0.tipo']),
    );
  });

  it('POST responde 400 si rompe una regla de negocio (dominio)', async () => {
    const res = await comoAna(request(app).post('/api/formularios')).send({
      titulo: 'x',
      preguntas: [{ tipo: 'opcion_unica', texto: 'x', opciones: ['Única'] }],
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Pregunta 1: necesita al menos 2 opciones' });
  });

  it('GET lista, GET /:id obtiene y PUT actualiza', async () => {
    const { body: creado } = await comoAna(request(app).post('/api/formularios')).send(cuerpo);

    const lista = await comoAna(request(app).get('/api/formularios'));
    expect(lista.body.formularios).toEqual([expect.objectContaining({ id: creado.id, cantidadPreguntas: 3 })]);

    const detalle = await comoAna(request(app).get(`/api/formularios/${creado.id}`));
    expect(detalle.status).toBe(200);
    expect(detalle.body.preguntas).toHaveLength(3);

    const editado = await comoAna(request(app).put(`/api/formularios/${creado.id}`)).send({ titulo: 'Otro', version: 1 });
    expect(editado.status).toBe(200);
    expect(editado.body).toMatchObject({ titulo: 'Otro', preguntas: [], slug: creado.slug });
  });

  it('DELETE responde 204 y después el formulario ya no existe', async () => {
    const { body: creado } = await comoAna(request(app).post('/api/formularios')).send(cuerpo);

    const borrado = await comoAna(request(app).delete(`/api/formularios/${creado.id}`));
    const despues = await comoAna(request(app).get(`/api/formularios/${creado.id}`));

    expect(borrado.status).toBe(204);
    expect(despues.status).toBe(404);
  });

  it('un usuario no puede ver, editar ni borrar formularios ajenos (404)', async () => {
    const { body: creado } = await comoAna(request(app).post('/api/formularios')).send(cuerpo);
    const comoBeto = (req: request.Test) => req.set('Authorization', `Bearer ${tokenBeto}`);

    expect((await comoBeto(request(app).get(`/api/formularios/${creado.id}`))).status).toBe(404);
    expect((await comoBeto(request(app).put(`/api/formularios/${creado.id}`)).send({ ...cuerpo, version: 1 })).status).toBe(404);
    expect((await comoBeto(request(app).delete(`/api/formularios/${creado.id}`))).status).toBe(404);
    expect((await comoBeto(request(app).get('/api/formularios'))).body.formularios).toEqual([]);
  });

  it('un id con formato inválido responde 404', async () => {
    const res = await comoAna(request(app).get('/api/formularios/no-es-un-id'));

    expect(res.status).toBe(404);
  });
});
