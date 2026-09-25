export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  passwordHash: string;
  creadoEn: Date;
}

/** Lo que se puede mostrar hacia afuera: nunca incluye el hash de la contraseña. */
export type UsuarioPublico = Omit<Usuario, 'passwordHash'>;

export function aUsuarioPublico({ passwordHash: _omitido, ...publico }: Usuario): UsuarioPublico {
  return publico;
}

/** Un email se guarda y se busca siempre en minúsculas y sin espacios alrededor. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}
