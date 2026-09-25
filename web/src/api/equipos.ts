import type { DetalleEquipo, EquipoDeUsuario, RolEquipo, Serializado } from '@formalista/compartido';
import { pedir } from './cliente';

export type MiEquipo = Serializado<EquipoDeUsuario>;
export type Equipo = Serializado<DetalleEquipo>;

export const clavesEquipos = {
  /** Ojo: es también el prefijo de cada detalle. Para invalidar solo la lista, usar exact: true. */
  lista: ['equipos'] as const,
  detalle: (id: string) => ['equipos', id] as const,
};

const ruta = (id: string) => `/equipos/${encodeURIComponent(id)}`;

export const apiEquipos = {
  listar: () => pedir<{ equipos: MiEquipo[] }>('/equipos').then((r) => r.equipos),
  crear: (nombre: string) => pedir<Equipo>('/equipos', { metodo: 'POST', cuerpo: { nombre } }),
  obtener: (id: string) => pedir<Equipo>(ruta(id)),
  // Las mutaciones de miembros devuelven el equipo actualizado: la pantalla no necesita otro GET.
  agregarMiembro: (id: string, email: string, rol: RolEquipo) =>
    pedir<Equipo>(`${ruta(id)}/miembros`, { metodo: 'POST', cuerpo: { email, rol } }),
  cambiarRol: (id: string, usuarioId: number, rol: RolEquipo) =>
    pedir<Equipo>(`${ruta(id)}/miembros/${usuarioId}`, { metodo: 'PATCH', cuerpo: { rol } }),
  /** Quitar a otro (solo propietario) o quitarse a uno mismo (salir del equipo). */
  quitarMiembro: (id: string, usuarioId: number) => pedir<void>(`${ruta(id)}/miembros/${usuarioId}`, { metodo: 'DELETE' }),
};
