import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Detalle } from '../src/api/formularios';

/** Un formulario completo como lo devuelve GET /api/formularios/:id (propio y en borrador, salvo cambios). */
export function detalleDePrueba(cambios: Partial<Detalle> = {}): Detalle {
  return {
    id: 'f1',
    titulo: 'Encuesta de café',
    descripcion: '',
    slug: 'encuesta-de-cafe-abc12345',
    version: 1,
    preguntas: [],
    estado: 'borrador',
    rol: 'propietario',
    equipo: null,
    creadoEn: '2026-09-25T12:00:00.000Z',
    actualizadoEn: '2026-09-25T12:00:00.000Z',
    ...cambios,
  };
}

export const ana = { id: 1, nombre: 'Ana', email: 'ana@correo.cl', creadoEn: '2026-09-25T12:00:00.000Z' };

/** Por defecto no hay sesión (como un navegador sin la cookie). Cada prueba agrega lo que necesita. */
export const servidor = setupServer(
  http.get('/api/auth/yo', () => HttpResponse.json({ error: 'Falta el token de acceso' }, { status: 401 })),
  http.get('/api/formularios', () => HttpResponse.json({ formularios: [] })),
);

/** Simula una cookie de sesión válida: /auth/yo devuelve a Ana. */
export function conSesion(usuario = ana): void {
  servidor.use(http.get('/api/auth/yo', () => HttpResponse.json({ usuario })));
}
