import type { FormularioDetalle, ResumenFormulario, Serializado } from '@formalista/compartido';
import { pedir } from './cliente';

export type Resumen = Serializado<ResumenFormulario>;
export type Detalle = Serializado<FormularioDetalle>;

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
};

/** El link que se comparte para responder (la página pública llega en la pantalla 4). */
export function linkPublico(slug: string): string {
  return new URL(`/f/${slug}`, window.location.origin).toString();
}
