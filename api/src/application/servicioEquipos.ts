import { validarCambioDeMiembro, type RolEquipo } from '../domain/permisos.js';
import { normalizarEmail } from '../domain/usuario.js';
import { ErrorAplicacion } from './errores.js';
import type { Equipo, EquipoDeUsuario, Miembro, RepositorioEquipos, RepositorioUsuarios } from './puertos.js';

export interface DetalleEquipo extends Equipo {
  /** Rol del usuario que consulta. */
  rol: RolEquipo;
  miembros: Miembro[];
}

/**
 * Gestión de equipos. Mismo criterio que con formularios:
 * - No ser miembro → 404 (no se revela que el equipo existe).
 * - Ser miembro sin el rol necesario → 403.
 */
export class ServicioEquipos {
  constructor(
    private readonly equipos: RepositorioEquipos,
    private readonly usuarios: RepositorioUsuarios,
  ) {}

  async crear(usuarioId: number, nombre: string): Promise<DetalleEquipo> {
    const equipo = await this.equipos.crearConPropietario(nombre.trim(), usuarioId);
    return this.obtener(usuarioId, equipo.id);
  }

  listar(usuarioId: number): Promise<EquipoDeUsuario[]> {
    return this.equipos.listarDeUsuario(usuarioId);
  }

  async obtener(usuarioId: number, equipoId: number): Promise<DetalleEquipo> {
    const rol = await this.rolComoMiembro(usuarioId, equipoId);
    const [equipo, miembros] = await Promise.all([this.equipos.buscar(equipoId), this.equipos.listarMiembros(equipoId)]);
    if (!equipo) throw equipoNoEncontrado();
    return { ...equipo, rol, miembros };
  }

  async agregarMiembro(usuarioId: number, equipoId: number, email: string, rol: RolEquipo): Promise<DetalleEquipo> {
    await this.exigirPropietario(usuarioId, equipoId);

    // Solo un propietario del equipo llega aquí, así que revelar que el email no existe es aceptable.
    const usuario = await this.usuarios.buscarPorEmail(normalizarEmail(email));
    if (!usuario) throw new ErrorAplicacion('no_encontrado', 'No existe un usuario con ese email');

    await this.equipos.agregarMiembro(equipoId, usuario.id, rol);
    return this.obtener(usuarioId, equipoId);
  }

  async cambiarRol(usuarioId: number, equipoId: number, miembroId: number, rol: RolEquipo): Promise<DetalleEquipo> {
    await this.exigirPropietario(usuarioId, equipoId);
    await this.equipos.modificarMiembro(equipoId, miembroId, rol, (miembros) =>
      lanzarSiInvalido(validarCambioDeMiembro(miembros, miembroId, rol)),
    );
    return this.obtener(usuarioId, equipoId);
  }

  /** Un propietario puede quitar a cualquiera; cualquier miembro puede quitarse a sí mismo (salir). */
  async quitarMiembro(usuarioId: number, equipoId: number, miembroId: number): Promise<void> {
    const rol = await this.rolComoMiembro(usuarioId, equipoId);
    if (miembroId !== usuarioId && rol !== 'propietario') throw soloPropietario();

    await this.equipos.modificarMiembro(equipoId, miembroId, null, (miembros) =>
      lanzarSiInvalido(validarCambioDeMiembro(miembros, miembroId, null)),
    );
  }

  private async rolComoMiembro(usuarioId: number, equipoId: number): Promise<RolEquipo> {
    const rol = await this.equipos.rolDe(equipoId, usuarioId);
    if (!rol) throw equipoNoEncontrado();
    return rol;
  }

  private async exigirPropietario(usuarioId: number, equipoId: number): Promise<void> {
    if ((await this.rolComoMiembro(usuarioId, equipoId)) !== 'propietario') throw soloPropietario();
  }
}

function lanzarSiInvalido(invalido: ReturnType<typeof validarCambioDeMiembro>): void {
  if (!invalido) return;
  throw new ErrorAplicacion(invalido.motivo === 'no_miembro' ? 'no_encontrado' : 'conflicto', invalido.mensaje);
}

function equipoNoEncontrado(): ErrorAplicacion {
  return new ErrorAplicacion('no_encontrado', 'Equipo no encontrado');
}

function soloPropietario(): ErrorAplicacion {
  return new ErrorAplicacion('prohibido', 'Solo un propietario del equipo puede gestionar sus miembros');
}
