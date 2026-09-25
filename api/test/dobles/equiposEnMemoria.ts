import { ErrorAplicacion } from '../../src/application/errores.js';
import type { Equipo, EquipoDeUsuario, Miembro, RepositorioEquipos } from '../../src/application/puertos.js';
import type { MiembroActual, RolEquipo } from '../../src/domain/permisos.js';
import type { RepositorioUsuariosEnMemoria } from './repositorioUsuariosEnMemoria.js';

/** Doble de MySQL (equipos + equipo_miembros). Usa el repositorio de usuarios para el "JOIN" con nombres. */
export class EquiposEnMemoria implements RepositorioEquipos {
  readonly equipos: Equipo[] = [];
  readonly miembros: { equipoId: number; usuarioId: number; rol: RolEquipo }[] = [];

  constructor(private readonly usuarios?: RepositorioUsuariosEnMemoria) {}

  async crearConPropietario(nombre: string, usuarioId: number): Promise<Equipo> {
    const equipo = { id: this.equipos.length + 1, nombre, creadoEn: new Date() };
    this.equipos.push(equipo);
    this.miembros.push({ equipoId: equipo.id, usuarioId, rol: 'propietario' });
    return equipo;
  }

  async listarDeUsuario(usuarioId: number): Promise<EquipoDeUsuario[]> {
    return this.miembros
      .filter((m) => m.usuarioId === usuarioId)
      .map((m) => ({
        ...this.equipos.find((e) => e.id === m.equipoId)!,
        rol: m.rol,
        cantidadMiembros: this.miembros.filter((x) => x.equipoId === m.equipoId).length,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  async buscar(equipoId: number): Promise<Equipo | null> {
    return this.equipos.find((e) => e.id === equipoId) ?? null;
  }

  async listarMiembros(equipoId: number): Promise<Miembro[]> {
    const orden: RolEquipo[] = ['propietario', 'editor', 'lector'];
    const lista = await Promise.all(
      this.miembros
        .filter((m) => m.equipoId === equipoId)
        .map(async (m) => {
          const usuario = await this.usuarios?.buscarPorId(m.usuarioId);
          return { usuarioId: m.usuarioId, nombre: usuario?.nombre ?? '', email: usuario?.email ?? '', rol: m.rol };
        }),
    );
    return lista.sort((a, b) => orden.indexOf(a.rol) - orden.indexOf(b.rol) || a.nombre.localeCompare(b.nombre));
  }

  async rolDe(equipoId: number, usuarioId: number): Promise<RolEquipo | null> {
    return this.miembros.find((m) => m.equipoId === equipoId && m.usuarioId === usuarioId)?.rol ?? null;
  }

  async agregarMiembro(equipoId: number, usuarioId: number, rol: RolEquipo): Promise<void> {
    if (await this.rolDe(equipoId, usuarioId)) throw new ErrorAplicacion('conflicto', 'El usuario ya es miembro del equipo');
    this.miembros.push({ equipoId, usuarioId, rol });
  }

  async modificarMiembro(
    equipoId: number,
    usuarioId: number,
    nuevoRol: RolEquipo | null,
    validar: (miembros: MiembroActual[]) => void,
  ): Promise<void> {
    validar(this.miembros.filter((m) => m.equipoId === equipoId).map(({ usuarioId: u, rol }) => ({ usuarioId: u, rol })));
    const indice = this.miembros.findIndex((m) => m.equipoId === equipoId && m.usuarioId === usuarioId);
    if (indice === -1) return;
    if (nuevoRol === null) this.miembros.splice(indice, 1);
    else this.miembros[indice]!.rol = nuevoRol;
  }
}
