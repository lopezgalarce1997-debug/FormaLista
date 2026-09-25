import { aUsuarioPublico, normalizarEmail, type Usuario, type UsuarioPublico } from '@formalista/compartido';
import { ErrorAplicacion } from './errores.js';
import type { Hasheador, RepositorioUsuarios, ServicioTokens } from './puertos.js';

export interface DatosRegistro {
  nombre: string;
  email: string;
  password: string;
}

export interface DatosLogin {
  email: string;
  password: string;
}

export interface ResultadoAuth {
  usuario: UsuarioPublico;
  token: string;
}

export class ServicioAuth {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly hasheador: Hasheador,
    private readonly tokens: ServicioTokens,
  ) {}

  async registrar(datos: DatosRegistro): Promise<ResultadoAuth> {
    const email = normalizarEmail(datos.email);

    // Chequeo previo para dar un mensaje claro. Si dos registros llegan a la vez,
    // el índice único de la base es la protección definitiva (el repositorio lanza 'conflicto').
    if (await this.usuarios.buscarPorEmail(email)) {
      throw new ErrorAplicacion('conflicto', 'El email ya está registrado');
    }

    const passwordHash = await this.hasheador.hashear(datos.password);
    const usuario = await this.usuarios.crear({ nombre: datos.nombre.trim(), email, passwordHash });
    return this.emitirToken(usuario);
  }

  async login(datos: DatosLogin): Promise<ResultadoAuth> {
    const usuario = await this.usuarios.buscarPorEmail(normalizarEmail(datos.email));

    if (!usuario) {
      // Se hashea igual para que la respuesta tarde lo mismo que con un email existente:
      // así nadie puede averiguar qué emails están registrados midiendo tiempos.
      await this.hasheador.hashear(datos.password);
      throw credencialesInvalidas();
    }

    if (!(await this.hasheador.comparar(datos.password, usuario.passwordHash))) {
      throw credencialesInvalidas();
    }

    return this.emitirToken(usuario);
  }

  async obtenerPerfil(usuarioId: number): Promise<UsuarioPublico> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (!usuario) throw new ErrorAplicacion('no_encontrado', 'Usuario no encontrado');
    return aUsuarioPublico(usuario);
  }

  private async emitirToken(usuario: Usuario): Promise<ResultadoAuth> {
    return { usuario: aUsuarioPublico(usuario), token: await this.tokens.firmar(usuario.id) };
  }
}

// Mismo mensaje para "no existe" y "contraseña incorrecta": no revela cuál de los dos falló.
function credencialesInvalidas(): ErrorAplicacion {
  return new ErrorAplicacion('no_autorizado', 'Credenciales inválidas');
}
