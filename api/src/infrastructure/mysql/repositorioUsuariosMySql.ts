import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ErrorAplicacion } from '../../application/errores.js';
import type { NuevoUsuario, RepositorioUsuarios } from '../../application/puertos.js';
import type { Usuario } from '../../domain/usuario.js';

interface FilaUsuario extends RowDataPacket {
  id: number;
  nombre: string;
  email: string;
  password_hash: string;
  creado_en: Date;
}

const COLUMNAS = 'id, nombre, email, password_hash, creado_en';

/**
 * Se usa execute() (sentencias preparadas con ?) y nunca concatenación de valores:
 * es la defensa contra inyección SQL, igual que SqlParameter en ADO.NET.
 */
export class RepositorioUsuariosMySql implements RepositorioUsuarios {
  constructor(private readonly pool: Pool) {}

  async buscarPorId(id: number): Promise<Usuario | null> {
    const [filas] = await this.pool.execute<FilaUsuario[]>(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`, [id]);
    return filas[0] ? aUsuario(filas[0]) : null;
  }

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const [filas] = await this.pool.execute<FilaUsuario[]>(`SELECT ${COLUMNAS} FROM usuarios WHERE email = ?`, [
      email,
    ]);
    return filas[0] ? aUsuario(filas[0]) : null;
  }

  async crear(datos: NuevoUsuario): Promise<Usuario> {
    let resultado: ResultSetHeader;
    try {
      [resultado] = await this.pool.execute<ResultSetHeader>(
        'INSERT INTO usuarios (nombre, email, password_hash) VALUES (?, ?, ?)',
        [datos.nombre, datos.email, datos.passwordHash],
      );
    } catch (error) {
      if (esClaveDuplicada(error)) throw new ErrorAplicacion('conflicto', 'El email ya está registrado');
      throw error;
    }

    // Se relee la fila para devolver exactamente lo guardado (incluido creado_en generado por MySQL).
    const usuario = await this.buscarPorId(resultado.insertId);
    if (!usuario) throw new Error(`No se encontró el usuario recién creado (id ${resultado.insertId})`);
    return usuario;
  }
}

function aUsuario(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    nombre: fila.nombre,
    email: fila.email,
    passwordHash: fila.password_hash,
    creadoEn: fila.creado_en,
  };
}

function esClaveDuplicada(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY';
}
