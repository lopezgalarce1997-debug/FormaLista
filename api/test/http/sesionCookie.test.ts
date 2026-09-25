import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearAppDePrueba } from '../dobles/crearAppDePrueba.js';

const ana = { nombre: 'Ana', email: 'ana@correo.cl', password: 'secreta123' };

/** El header Set-Cookie de la sesión, como texto. */
const cookieDe = (res: request.Response): string =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('formalista_sesion=')) ?? '';

describe('Sesión con cookie httpOnly', () => {
  it.each([
    ['registro', '/api/auth/registro', ana],
    ['login', '/api/auth/login', { email: ana.email, password: ana.password }],
  ])('%s deja una cookie HttpOnly, SameSite=Strict y limitada a /api', async (_caso, ruta, cuerpo) => {
    const app = crearAppDePrueba();
    if (ruta.endsWith('login')) await request(app).post('/api/auth/registro').send(ana);

    const cookie = cookieDe(await request(app).post(ruta).send(cuerpo));

    expect(cookie).toMatch(/^formalista_sesion=[\w-]+\.[\w-]+\.[\w-]+;/); // un JWT
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api');
    expect(cookie).not.toContain('Secure'); // en desarrollo (http) no
  });

  it('en producción la cookie es Secure (solo HTTPS)', async () => {
    const app = crearAppDePrueba({ cookieSegura: true });

    expect(cookieDe(await request(app).post('/api/auth/registro').send(ana))).toContain('Secure');
  });

  it('con la cookie (sin header Authorization) se accede a rutas protegidas', async () => {
    const navegador = request.agent(crearAppDePrueba()); // guarda y reenvía cookies como un navegador
    await navegador.post('/api/auth/registro').send(ana);

    const res = await navegador.get('/api/auth/yo');

    expect(res.status).toBe(200);
    expect(res.body.usuario.email).toBe('ana@correo.cl');
  });

  it('logout borra la cookie y desde ahí responde 401', async () => {
    const navegador = request.agent(crearAppDePrueba());
    await navegador.post('/api/auth/registro').send(ana);

    const salida = await navegador.post('/api/auth/logout');
    const despues = await navegador.get('/api/auth/yo');

    expect(salida.status).toBe(204);
    expect(cookieDe(salida)).toMatch(/^formalista_sesion=;.*Expires=Thu, 01 Jan 1970/);
    expect(despues.status).toBe(401);
  });

  it('logout sin sesión también responde 204 (idempotente)', async () => {
    expect((await request(crearAppDePrueba()).post('/api/auth/logout')).status).toBe(204);
  });

  it('una cookie con un token inválido responde 401', async () => {
    const res = await request(crearAppDePrueba()).get('/api/auth/yo').set('Cookie', 'formalista_sesion=basura');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Token inválido o expirado' });
  });

  it('el header Bearer sigue funcionando y tiene prioridad sobre la cookie', async () => {
    const app = crearAppDePrueba();
    const { body } = await request(app).post('/api/auth/registro').send(ana);

    const res = await request(app)
      .get('/api/auth/yo')
      .set('Authorization', `Bearer ${body.token}`)
      .set('Cookie', 'formalista_sesion=basura');

    expect(res.status).toBe(200);
  });
});
