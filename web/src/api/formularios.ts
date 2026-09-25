import type { esquemaActualizacion, FormularioDetalle, ResumenFormulario, Serializado } from '@formalista/compartido';
import type { z } from 'zod';
import { pedir } from './cliente';

export type Resumen = Serializado<ResumenFormulario>;
export type Detalle = Serializado<FormularioDetalle>;
/** Cuerpo de PUT /formularios/:id, según el esquema compartido que valida la API. */
export type CuerpoActualizacion = z.input<typeof esquemaActualizacion>;

/** Claves de caché de TanStack Query: un solo lugar para no escribirlas a mano en cada pantalla. */
export const clavesFormularios = {
  lista: ['formularios'] as const,
  detalle: (id: string) => ['formularios', id] as const,
};

export const apiFormularios = {
  listar: () => pedir<{ formularios: Resumen[] }>('/formularios').then((r) => r.formularios),
  /** Solo el título: la API completa descripción y preguntas con sus valores por defecto. */
  crear: (titulo: string) => pedir<Detalle>('/formularios', { metodo: 'POST', cuerpo: { titulo } }),
  eliminar: (id: string) => pedir<void>(`/formularios/${encodeURIComponent(id)}`, { metodo: 'DELETE' }),
  obtener: (id: string) => pedir<Detalle>(`/formularios/${encodeURIComponent(id)}`),
  /** El cuerpo lleva la `version` que se estaba editando: si ya no es la vigente, la API responde 409. */
  actualizar: (id: string, cuerpo: CuerpoActualizacion) =>
    pedir<Detalle>(`/formularios/${encodeURIComponent(id)}`, { metodo: 'PUT', cuerpo }),
};

/** El link que se comparte para responder (la página pública llega en la pantalla 4). */
export function linkPublico(slug: string): string {
  return new URL(`/f/${slug}`, window.location.origin).toString();
}
