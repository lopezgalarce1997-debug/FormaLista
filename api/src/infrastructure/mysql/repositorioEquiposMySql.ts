import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ErrorAplicacion } from '../../application/errores.js';
import type { Equipo, EquipoDeUsuario, Miembro, RepositorioEquipos } from '../../application/puertos.js';
import type { MiembroActual, RolEquipo } from '../../domain/permisos.js';
import { enTransaccion } from './transaccion.js';

interface FilaEquipo extends RowDataPacket {
  id: number;
  nombre: string;
  creado_en: Date;
}

interface FilaEquipoDeUsuario extends FilaEquipo {
  rol: RolEquipo;
  cantidad_miembros: number;
}

interface FilaMiembro extends RowDataPacket {
  usuario_id: number;
  nombre: string;
  email: string;
  rol: RolEquipo;
}

export class RepositorioEquiposMySql implements RepositorioEquipos {
  constructor(private readonly pool: Pool) {}

  /**
   * Transacción real (una sola base): o se crean el equipo y la membresía del creador, o nada.
   * Contraste con el paso 5, donde MySQL + MongoDB no admiten una transacción común y se usa compensación.
   */
  crearConPropietario(nombre: string, usuarioId: number): Promise<Equipo> {
    return enTransaccion(this.pool, async (conexion) => {
      const [resultado] = await conexion.execute<ResultSetHeader>('INSERT INTO equipos (nombre) VALUES (?)', [nombre]);
      await conexion.execute("INSERT INTO equipo_miembros (equipo_id, usuario_id, rol) VALUES (?, ?, 'propietario')", [
        resultado.insertId,
        usuarioId,
      ]);
      const [filas] = await conexion.execute<FilaEquipo[]>('SELECT id, nombre, creado_en FROM equipos WHERE id = ?', [
        resultado.insertId,
      ]);
      return aEquipo(filas[0]!);
    });
  }

  /** Mis equipos con mi rol y cuántos miembros tiene cada uno (JOIN + GROUP BY). */
  async listarDeUsuario(usuarioId: number): Promise<EquipoDeUsuario[]> {
    const [filas] = await this.pool.execute<FilaEquipoDeUsuario[]>(
      `SELECT e.id, e.nombre, e.creado_en, yo.rol, COUNT(todos.usuario_id) AS cantidad_miembros
       FROM equipo_miembros yo
       JOIN equipos e             ON e.id = yo.equipo_id
       JOIN equipo_miembros todos ON todos.equipo_id = e.id
       WHERE yo.usuario_id = ?
       GROUP BY e.id, e.nombre, e.creado_en, yo.rol
       ORDER BY e.nombre`,
      [usuarioId],
    );
    return filas.map((f) => ({ ...aEquipo(f), rol: f.rol, cantidadMiembros: Number(f.cantidad_miembros) }));
  }

  async buscar(equipoId: number): Promise<Equipo | null> {
    const [filas] = await this.pool.execute<FilaEquipo[]>('SELECT id, nombre, creado_en FROM equipos WHERE id = ?', [
      equipoId,
    ]);
    return filas[0] ? aEquipo(filas[0]) : null;
  }

  /** Miembros con nombre y email (JOIN con usuarios); propietarios primero. */
  async listarMiembros(equipoId: number): Promise<Miembro[]> {
    const [filas] = await this.pool.execute<FilaMiembro[]>(
      `SELECT em.usuario_id, u.nombre, u.email, em.rol
       FROM equipo_miembros em
       JOIN usuarios u ON u.id = em.usuario_id
       WHERE em.equipo_id = ?
       ORDER BY FIELD(em.rol, 'propietario', 'editor', 'lector'), u.nombre`,
      [equipoId],
    );
    return filas.map((f) => ({ usuarioId: f.usuario_id, nombre: f.nombre, email: f.email, rol: f.rol }));
  }

  async rolDe(equipoId: number, usuarioId: number): Promise<RolEquipo | null> {
    const [filas] = await this.pool.execute<(RowDataPacket & { rol: RolEquipo })[]>(
      'SELECT rol FROM equipo_miembros WHERE equipo_id = ? AND usuario_id = ?',
      [equipoId, usuarioId],
    );
    return filas[0]?.rol ?? null;
  }

  async agregarMiembro(equipoId: number, usuarioId: number, rol: RolEquipo): Promise<void> {
    try {
      await this.pool.execute('INSERT INTO equipo_miembros (equipo_id, usuario_id, rol) VALUES (?, ?, ?)', [
        equipoId,
        usuarioId,
        rol,
      ]);
    } catch (error) {
      // La PK (equipo_id, usuario_id) impide duplicados, incluso con dos peticiones simultáneas.
      if ((error as { code?: string } | null)?.code === 'ER_DUP_ENTRY') {
        throw new ErrorAplicacion('conflicto', 'El usuario ya es miembro del equipo');
      }
      throw error;
    }
  }

  /**
   * SELECT ... FOR UPDATE bloquea las filas de miembros del equipo hasta el COMMIT: si dos
   * propietarios se degradan mutuamente al mismo tiempo, el segundo espera, ve el cambio del
   * primero y la regla "al menos un propietario" lo rechaza. Sin el bloqueo, ambos verían 2
   * propietarios y el equipo quedaría sin ninguno.
   */
  modificarMiembro(
    equipoId: number,
    usuarioId: number,
    nuevoRol: RolEquipo | null,
    validar: (miembros: MiembroActual[]) => void,
  ): Promise<void> {
    return enTransaccion(this.pool, async (conexion) => {
      const [filas] = await conexion.execute<(RowDataPacket & { usuario_id: number; rol: RolEquipo })[]>(
        'SELECT usuario_id, rol FROM equipo_miembros WHERE equipo_id = ? FOR UPDATE',
        [equipoId],
      );
      validar(filas.map((f) => ({ usuarioId: f.usuario_id, rol: f.rol }))); // si lanza → ROLLBACK

      if (nuevoRol === null) {
        await conexion.execute('DELETE FROM equipo_miembros WHERE equipo_id = ? AND usuario_id = ?', [equipoId, usuarioId]);
      } else {
        await conexion.execute('UPDATE equipo_miembros SET rol = ? WHERE equipo_id = ? AND usuario_id = ?', [
          nuevoRol,
          equipoId,
          usuarioId,
        ]);
      }
    });
  }
}

function aEquipo(fila: FilaEquipo): Equipo {
  return { id: fila.id, nombre: fila.nombre, creadoEn: fila.creado_en };
}
