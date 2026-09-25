// Interfaces que la capa de aplicación necesita y que infrastructure implementa
// (como las interfaces IRepository de la capa Application en Clean Architecture .NET).
import type { Usuario } from '../domain/usuario.js';

export interface NuevoUsuario {
  nombre: string;
  email: string;
  passwordHash: string;
}

export interface RepositorioUsuarios {
  buscarPorId(id: number): Promise<Usuario | null>;
  buscarPorEmail(email: string): Promise<Usuario | null>;
  /** Lanza ErrorAplicacion('conflicto') si el email ya existe. */
  crear(datos: NuevoUsuario): Promise<Usuario>;
}

export interface Hasheador {
  hashear(texto: string): Promise<string>;
  comparar(texto: string, hash: string): Promise<boolean>;
}

export interface ServicioTokens {
  firmar(usuarioId: number): Promise<string>;
  /** Devuelve el id del usuario o lanza ErrorAplicacion('no_autorizado'). */
  verificar(token: string): Promise<number>;
}
