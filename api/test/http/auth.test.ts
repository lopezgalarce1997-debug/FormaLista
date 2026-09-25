import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearAppDePrueba } from '../dobles/crearAppDePrueba.js';

const ana = { nombre: 'Ana', email: 'ana@correo.cl', password: 'secreta123' };

describe('API de autenticación', () => {
  let app: ReturnType<typeof crearAppDePrueba>;

  beforeEach(() => {
    app = crearAppDePrueba();
  });

  describe('POST /api/auth/registro', () => {
    it('crea el usuario, responde 201 con token y nunca devuelve el hash', async () => {
      const res = await request(app).post('/api/auth/registro').send(ana);

      expect(res.status).toBe(201);
      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.usuario).toMatchObject({ id: 1, nombre: 'Ana', email: 'ana@correo.cl' });
      expect(JSON.stringify(res.body)).not.toMatch(/hash|secreta123/i);
    });

    it('responde 400 con el detalle de cada campo inválido', async () => {
      const res = await request(app).post('/api/auth/registro').send({ nombre: '', email: 'no-es-email', password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.detalles.map((d: { campo: string }) => d.campo).sort()).toEqual(['email', 'nombre', 'password']);
    });

    it('rechaza contraseñas de más de 72 bytes (límite de bcrypt)', async () => {
      const res = await request(app)
        .post('/api/auth/registro')
        .send({ ...ana, password: 'ñ'.repeat(37) }); // 37 caracteres, pero 74 bytes en UTF-8

      expect(res.status).toBe(400);
    });

    it('responde 409 si el email ya está registrado', async () => {
      await request(app).post('/api/auth/registro').send(ana);

      const res = await request(app).post('/api/auth/registro').send({ ...ana, email: 'ANA@correo.cl' });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'El email ya está registrado' });
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/registro').send(ana);
    });

    it('responde 200 con token si las credenciales son correctas', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: ana.email, password: ana.password });

      expect(res.status).toBe(200);
      expect(res.body.token).toEqual(expect.any(String));
    });

    it('responde 401 con un mensaje genérico si la contraseña es incorrecta', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: ana.email, password: 'incorrecta' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Credenciales inválidas' });
    });
  });

  describe('GET /api/auth/yo', () => {
    it('devuelve el usuario del token', async () => {
      const { body } = await request(app).post('/api/auth/registro').send(ana);

      const res = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${body.token}`);

      expect(res.status).toBe(200);
      expect(res.body.usuario).toMatchObject({ id: 1, email: 'ana@correo.cl' });
    });

    it('responde 401 sin token', async () => {
      const res = await request(app).get('/api/auth/yo');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Falta el token de acceso' });
    });

    it('responde 401 con un token inválido', async () => {
      const res = await request(app).get('/api/auth/yo').set('Authorization', 'Bearer basura');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Token inválido o expirado' });
    });
  });
});
