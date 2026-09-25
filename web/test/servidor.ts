import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const ana = { id: 1, nombre: 'Ana', email: 'ana@correo.cl', creadoEn: '2026-09-25T12:00:00.000Z' };

/** Por defecto no hay sesión (como un navegador sin la cookie). Cada prueba agrega lo que necesita. */
export const servidor = setupServer(
  http.get('/api/auth/yo', () => HttpResponse.json({ error: 'Falta el token de acceso' }, { status: 401 })),
);

/** Simula una cookie de sesión válida: /auth/yo devuelve a Ana. */
export function conSesion(usuario = ana): void {
  servidor.use(http.get('/api/auth/yo', () => HttpResponse.json({ usuario })));
}
