import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearApp } from '../../src/http/app.js';
import type { VerificadorSalud } from '../../src/http/rutas/salud.js';

const ok = (nombre: string): VerificadorSalud => ({ nombre, verificar: async () => {} });
const caido = (nombre: string): VerificadorSalud => ({
  nombre,
  verificar: async () => {
    throw new Error('sin conexión');
  },
});

describe('GET /api/salud', () => {
  it('responde 200 cuando todas las bases responden', async () => {
    const app = crearApp({ verificadoresSalud: [ok('mysql'), ok('mongo')] });

    const res = await request(app).get('/api/salud');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok', servicios: { mysql: 'ok', mongo: 'ok' } });
  });

  it('responde 503 e indica qué base falla, sin exponer el error interno', async () => {
    const app = crearApp({ verificadoresSalud: [ok('mysql'), caido('mongo')] });

    const res = await request(app).get('/api/salud');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ estado: 'degradado', servicios: { mysql: 'ok', mongo: 'error' } });
    expect(JSON.stringify(res.body)).not.toContain('sin conexión');
  });
});

describe('manejo global de errores', () => {
  const app = crearApp({ verificadoresSalud: [] });

  it('responde 404 en rutas que no existen', async () => {
    const res = await request(app).get('/api/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Recurso no encontrado' });
  });

  it('responde 400 ante JSON mal formado', async () => {
    const res = await request(app)
      .post('/api/salud')
      .set('Content-Type', 'application/json')
      .send('{ "mal": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Solicitud inválida' });
  });
});
