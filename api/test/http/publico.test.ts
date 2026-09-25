import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Limite } from '../../src/http/middlewares/limites.js';
import { crearAppDePrueba } from '../dobles/crearAppDePrueba.js';

type App = ReturnType<typeof crearAppDePrueba>;

const cuerpo = {
  titulo: 'Encuesta de café',
  preguntas: [
    { id: 'nombre', tipo: 'texto_corto', texto: '¿Tu nombre?', obligatoria: true },
    { id: 'nota', tipo: 'escala', texto: 'Del 1 al 5' },
  ],
};

/** Registra un usuario, crea un formulario y lo deja en el estado pedido. */
async function prepararFormulario(app: App, estado: 'borrador' | 'publicado' | 'cerrado' = 'publicado') {
  const { body: auth } = await request(app)
    .post('/api/auth/registro')
    .send({ nombre: 'Ana', email: 'ana@correo.cl', password: 'secreta123' });
  const conToken = (req: request.Test) => req.set('Authorization', `Bearer ${auth.token}`);

  const { body: formulario } = await conToken(request(app).post('/api/formularios')).send(cuerpo);
  if (estado !== 'borrador') await conToken(request(app).post(`/api/formularios/${formulario.id}/publicar`));
  if (estado === 'cerrado') await conToken(request(app).post(`/api/formularios/${formulario.id}/cerrar`));

  return { slug: formulario.slug as string, id: formulario.id as string, conToken };
}

describe('Publicar y cerrar (con autenticación)', () => {
  it('POST /publicar y /cerrar cambian el estado; una transición inválida responde 409', async () => {
    const app = crearAppDePrueba();
    const { id, conToken } = await prepararFormulario(app, 'borrador');

    const publicado = await conToken(request(app).post(`/api/formularios/${id}/publicar`));
    const otraVez = await conToken(request(app).post(`/api/formularios/${id}/publicar`));
    const cerrado = await conToken(request(app).post(`/api/formularios/${id}/cerrar`));

    expect(publicado.status).toBe(200);
    expect(publicado.body.estado).toBe('publicado');
    expect(otraVez.status).toBe(409);
    expect(otraVez.body).toEqual({ error: 'El formulario ya está publicado' });
    expect(cerrado.body.estado).toBe('cerrado');
  });

  it('publicar sin preguntas responde 400', async () => {
    const app = crearAppDePrueba();
    const { conToken } = await prepararFormulario(app, 'borrador');
    const { body: vacio } = await conToken(request(app).post('/api/formularios')).send({ titulo: 'Vacío' });

    const res = await conToken(request(app).post(`/api/formularios/${vacio.id}/publicar`));

    expect(res.status).toBe(400);
  });
});

describe('API pública (sin autenticación)', () => {
  let app: App;

  beforeEach(() => {
    app = crearAppDePrueba();
  });

  it('GET /api/publico/:slug devuelve el formulario sin id interno ni estado', async () => {
    const { slug } = await prepararFormulario(app);

    const res = await request(app).get(`/api/publico/${slug}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['descripcion', 'preguntas', 'slug', 'titulo', 'version']);
    expect(res.body.preguntas).toHaveLength(2);
  });

  it('POST /api/publico/:slug/respuestas guarda una respuesta válida (201)', async () => {
    const { slug } = await prepararFormulario(app);

    const res = await request(app)
      .post(`/api/publico/${slug}/respuestas`)
      .send({ respuestas: { nombre: 'Beto', nota: 5 } });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), enviadaEn: expect.any(String) });
  });

  it('responde 400 con el detalle por pregunta, en el mismo formato que la validación de Zod', async () => {
    const { slug } = await prepararFormulario(app);

    const res = await request(app)
      .post(`/api/publico/${slug}/respuestas`)
      .send({ respuestas: { nota: 9 } });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Hay respuestas inválidas',
      detalles: expect.arrayContaining([
        { campo: 'respuestas.nombre', mensaje: 'Es obligatoria' },
        { campo: 'respuestas.nota', mensaje: 'Debe estar entre 1 y 5' },
      ]),
    });
  });

  it.each([
    ['sin el objeto respuestas', {}],
    ['respuestas como lista', { respuestas: ['Beto', 5] }],
    ['respuestas como texto', { respuestas: 'hola' }],
  ])('responde 400 si el cuerpo no tiene la forma esperada (%s)', async (_caso, body) => {
    const { slug } = await prepararFormulario(app);

    const res = await request(app).post(`/api/publico/${slug}/respuestas`).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Datos inválidos');
  });

  it.each([
    ['borrador', 404],
    ['cerrado', 410],
  ] as const)('un formulario en %s responde %i, tanto al ver como al responder', async (estado, status) => {
    const { slug } = await prepararFormulario(app, estado);

    const ver = await request(app).get(`/api/publico/${slug}`);
    const responder = await request(app).post(`/api/publico/${slug}/respuestas`).send({ respuestas: { nombre: 'x' } });

    expect(ver.status).toBe(status);
    expect(responder.status).toBe(status);
  });

  it('un slug inexistente responde 404', async () => {
    expect((await request(app).get('/api/publico/no-existe-12345678')).status).toBe(404);
  });
});

describe('Límite de envíos por IP', () => {
  const limitePequeno: Limite = { ventanaMs: 60_000, maximo: 2 };

  it('envío de respuestas: al superar el máximo responde 429 con el header RateLimit', async () => {
    const app = crearAppDePrueba({ limites: { envioRespuestas: limitePequeno } });
    const { slug } = await prepararFormulario(app);
    const enviar = () => request(app).post(`/api/publico/${slug}/respuestas`).send({ respuestas: { nombre: 'x' } });

    const estados = [(await enviar()).status, (await enviar()).status];
    const bloqueado = await enviar();

    expect(estados).toEqual([201, 201]);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body).toEqual({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' });
    expect(bloqueado.headers['ratelimit']).toBeDefined();
  });

  it('login: solo cuentan los intentos FALLIDOS', async () => {
    const app = crearAppDePrueba({ limites: { login: limitePequeno } });
    const credenciales = { email: 'ana@correo.cl', password: 'secreta123' };
    await request(app).post('/api/auth/registro').send({ nombre: 'Ana', ...credenciales });
    const login = (password: string) => request(app).post('/api/auth/login').send({ ...credenciales, password });

    // Tres logins correctos seguidos no se bloquean...
    expect([(await login('secreta123')).status, (await login('secreta123')).status, (await login('secreta123')).status])
      .toEqual([200, 200, 200]);
    // ...pero dos fallidos agotan el límite, y desde ahí se bloquea incluso la contraseña correcta.
    expect([(await login('mala')).status, (await login('mala')).status]).toEqual([401, 401]);
    expect((await login('secreta123')).status).toBe(429);
  });
});
