import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { RegistroFormulario, RepositorioRegistroFormularios } from '../../application/puertos.js';
import type { EstadoFormulario } from '../../domain/formulario.js';

interface FilaRegistro extends RowDataPacket {
  id_mongo: string;
  propietario_id: number;
  equipo_id: number | null;
  estado: EstadoFormulario;
  creado_en: Date;
}

const COLUMNAS = 'id_mongo, propietario_id, equipo_id, estado, creado_en';
const TAMANO_LOTE = 500;

export class RepositorioRegistroFormulariosMySql implements RepositorioRegistroFormularios {
  constructor(private readonly pool: Pool) {}

  async crear(datos: { idMongo: string; propietarioId: number }): Promise<void> {
    await this.pool.execute('INSERT INTO formularios_registro (id_mongo, propietario_id) VALUES (?, ?)', [
      datos.idMongo,
      datos.propietarioId,
    ]);
  }

  async buscar(idMongo: string): Promise<RegistroFormulario | null> {
    const [filas] = await this.pool.execute<FilaRegistro[]>(
      `SELECT ${COLUMNAS} FROM formularios_registro WHERE id_mongo = ?`,
      [idMongo],
    );
    return filas[0] ? aRegistro(filas[0]) : null;
  }

  async listarPorPropietario(usuarioId: number): Promise<RegistroFormulario[]> {
    const [filas] = await this.pool.execute<FilaRegistro[]>(
      `SELECT ${COLUMNAS} FROM formularios_registro WHERE propietario_id = ? ORDER BY creado_en DESC, id_mongo DESC`,
      [usuarioId],
    );
    return filas.map(aRegistro);
  }

  async eliminar(idMongo: string): Promise<void> {
    await this.pool.execute('DELETE FROM formularios_registro WHERE id_mongo = ?', [idMongo]);
  }

  async cambiarEstado(idMongo: string, desde: EstadoFormulario[], hacia: EstadoFormulario): Promise<boolean> {
    // La condición sobre el estado actual va en el mismo UPDATE: MySQL lo evalúa y escribe de forma
    // atómica, así que dos peticiones simultáneas no pueden aplicar la misma transición.
    const [resultado] = await this.pool.query<ResultSetHeader>(
      'UPDATE formularios_registro SET estado = ? WHERE id_mongo = ? AND estado IN (?)',
      [hacia, idMongo, desde],
    );
    return resultado.affectedRows === 1;
  }

  async filtrarExistentes(idsMongo: string[]): Promise<Set<string>> {
    const existentes = new Set<string>();
    // Por lotes, para no armar un IN (...) gigante.
    for (let i = 0; i < idsMongo.length; i += TAMANO_LOTE) {
      const lote = idsMongo.slice(i, i + TAMANO_LOTE);
      // query() (no execute) porque expande el arreglo en "IN (?)" a una lista de valores escapados.
      const [filas] = await this.pool.query<FilaRegistro[]>(
        'SELECT id_mongo FROM formularios_registro WHERE id_mongo IN (?)',
        [lote],
      );
      filas.forEach((fila) => existentes.add(fila.id_mongo));
    }
    return existentes;
  }
}

function aRegistro(fila: FilaRegistro): RegistroFormulario {
  return {
    idMongo: fila.id_mongo,
    propietarioId: fila.propietario_id,
    equipoId: fila.equipo_id,
    estado: fila.estado,
    creadoEn: fila.creado_en,
  };
}
