import { http, HttpResponse } from 'msw';
import type { CuerpoActualizacion, Detalle } from '../src/api/formularios';
import { servidor } from './servidor';

/**
 * API simulada del formulario f1 con memoria:
 * - GET devuelve el estado actual.
 * - PUT lo guarda (asigna ids a las preguntas nuevas) y responde 409 si la versión ya no es la vigente.
 * - publicar / cerrar / compartir cambian el estado como la API real.
 */
export function conFormulario(inicial: Detalle, opciones: { versionNueva?: boolean } = {}) {
  const estado = {
    actual: inicial,
    cuerpos: [] as CuerpoActualizacion[],
    compartidoCon: [] as (number | null)[],
    equipos: [
      { id: 1, nombre: 'Marketing', creadoEn: '2026-09-01T00:00:00.000Z', rol: 'propietario' as const, cantidadMiembros: 3 },
      { id: 2, nombre: 'Ventas', creadoEn: '2026-09-02T00:00:00.000Z', rol: 'lector' as const, cantidadMiembros: 1 },
    ],
  };
  servidor.use(
    http.get('/api/formularios/f1', () => HttpResponse.json(estado.actual)),
    http.put('/api/formularios/f1', async ({ request }) => {
      const cuerpo = (await request.json()) as CuerpoActualizacion;
      estado.cuerpos.push(cuerpo);
      if (cuerpo.version !== estado.actual.version) {
        return HttpResponse.json({ error: 'El formulario fue modificado por otra persona' }, { status: 409 });
      }
      estado.actual = {
        ...estado.actual,
        titulo: cuerpo.titulo,
        descripcion: cuerpo.descripcion ?? '',
        version: estado.actual.version + (opciones.versionNueva ? 1 : 0),
        preguntas: (cuerpo.preguntas ?? []).map((p, i) => ({ obligatoria: false, ...p, id: p.id ?? `srv-${i}` })) as Detalle['preguntas'],
      };
      return HttpResponse.json(estado.actual);
    }),
    http.post('/api/formularios/f1/publicar', () => {
      estado.actual = { ...estado.actual, estado: 'publicado' };
      return HttpResponse.json(estado.actual);
    }),
    http.post('/api/formularios/f1/cerrar', () => {
      estado.actual = { ...estado.actual, estado: 'cerrado' };
      return HttpResponse.json(estado.actual);
    }),
    http.get('/api/equipos', () => HttpResponse.json({ equipos: estado.equipos })),
    http.post('/api/formularios/f1/compartir', async ({ request }) => {
      const { equipoId } = (await request.json()) as { equipoId: number | null };
      estado.compartidoCon.push(equipoId);
      const equipo = estado.equipos.find((e) => e.id === equipoId);
      estado.actual = { ...estado.actual, equipo: equipo ? { id: equipo.id, nombre: equipo.nombre } : null };
      return HttpResponse.json(estado.actual);
    }),
  );
  return estado;
}
