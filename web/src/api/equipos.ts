import type { EquipoDeUsuario, Serializado } from '@formalista/compartido';
import { pedir } from './cliente';

export type MiEquipo = Serializado<EquipoDeUsuario>;

export const clavesEquipos = {
  lista: ['equipos'] as const,
};

export const apiEquipos = {
  listar: () => pedir<{ equipos: MiEquipo[] }>('/equipos').then((r) => r.equipos),
};
