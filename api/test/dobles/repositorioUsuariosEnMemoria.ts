import { ErrorAplicacion } from '../../src/application/errores.js';
import type { NuevoUsuario, RepositorioUsuarios } from '../../src/application/puertos.js';
import type { Usuario } from '@formalista/compartido';

/** Repositorio falso que imita el comportamiento de MySQL, incluido el índice único del email. */
export class RepositorioUsuariosEnMemoria implements RepositorioUsuarios {
  readonly usuarios: Usuario[] = [];

  async buscarPorId(id: number): Promise<Usuario | null> {
    return this.usuarios.find((u) => u.id === id) ?? null;
  }

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    return this.usuarios.find((u) => u.email === email) ?? null;
  }

  async crear(datos: NuevoUsuario): Promise<Usuario> {
    if (this.usuarios.some((u) => u.email === datos.email)) {
      throw new ErrorAplicacion('conflicto', 'El email ya está registrado');
    }
    const usuario: Usuario = { id: this.usuarios.length + 1, ...datos, creadoEn: new Date() };
    this.usuarios.push(usuario);
    return usuario;
  }
}
