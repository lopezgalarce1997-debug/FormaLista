import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  AccesoFormulario,
  RegistroFormulario,
  RepositorioRegistroFormularios,
} from '../../application/puertos.js';
import type { EstadoFormulario, RolEquipo } from '@formalista/compartido';

interface FilaRegistro extends RowDataPacket {
  id_mongo: string;
  propietario_id: number;
  equipo_id: number | null;
  estado: EstadoFormulario;
  creado_en: Date;
}

interface FilaAcceso extends FilaRegistro {
  es_propietario: number; // MySQL devuelve la comparación como 0/1
  rol_equipo: RolEquipo | null;
  equipo_nombre: string | null;
}

const COLUMNAS = 'id_mongo, propietario_id, equipo_id, estado, creado_en';
const COLUMNAS_FR = 'fr.id_mongo, fr.propietario_id, fr.equipo_id, fr.estado, fr.creado_en';
const TAMANO_LOTE = 500;

/** Exportada para que las pruebas de integración verifiquen su plan con EXPLAIN. Parámetros: [usuarioId ×3]. */
export const CONSULTA_ACCESIBLES = `
  (SELECT ${COLUMNAS_FR}, 1 AS es_propietario, NULL AS rol_equipo, e.nombre AS equipo_nombre
   FROM formularios_registro fr
   LEFT JOIN equipos e ON e.id = fr.equipo_id
   WHERE fr.propietario_id = ?)
  UNION ALL
  (SELECT ${COLUMNAS_FR}, 0 AS es_propietario, em.rol AS rol_equipo, e.nombre AS equipo_nombre
   FROM equipo_miembros em
   JOIN formularios_registro fr ON fr.equipo_id = em.equipo_id
   JOIN equipos e               ON e.id = em.equipo_id
   WHERE em.usuario_id = ? AND fr.propietario_id <> ?)
  ORDER BY creado_en DESC, id_mongo DESC`;

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

  /**
   * Una sola consulta: el formulario + si el usuario es su propietario + su rol en el equipo con el
   * que está compartido. El LEFT JOIN trae la membresía solo si existe (si no, rol_equipo = NULL).
   * Usa la PK (equipo_id, usuario_id) de equipo_miembros, que coincide exactamente con la condición.
   */
  async buscarAcceso(idMongo: string, usuarioId: number): Promise<AccesoFormulario | null> {
    const [filas] = await this.pool.execute<FilaAcceso[]>(
      `SELECT ${COLUMNAS_FR},
              fr.propietario_id = ? AS es_propietario,
              em.rol                AS rol_equipo,
              e.nombre              AS equipo_nombre
       FROM formularios_registro fr
       LEFT JOIN equipo_miembros em ON em.equipo_id = fr.equipo_id AND em.usuario_id = ?
       LEFT JOIN equipos e          ON e.id = fr.equipo_id
       WHERE fr.id_mongo = ?`,
      [usuarioId, usuarioId, idMongo],
    );
    return filas[0] ? aAcceso(filas[0]) : null;
  }

  /**
   * Formularios propios + compartidos con mis equipos. UNION ALL de dos consultas en vez de un
   * "WHERE propietario_id = ? OR em.usuario_id IS NOT NULL": con OR entre dos tablas MySQL no puede
   * usar índices y recorre toda la tabla; así cada rama usa el suyo
   * (ix_formularios_registro_propietario / ix_equipo_miembros_usuario + ix_formularios_registro_equipo).
   * La condición propietario_id <> ? evita duplicar un formulario propio compartido con mi equipo.
   */
  async listarAccesibles(usuarioId: number): Promise<AccesoFormulario[]> {
    const [filas] = await this.pool.execute<FilaAcceso[]>(CONSULTA_ACCESIBLES, [usuarioId, usuarioId, usuarioId]);
    return filas.map(aAcceso);
  }

  async asignarEquipo(idMongo: string, equipoId: number | null): Promise<void> {
    await this.pool.execute('UPDATE formularios_registro SET equipo_id = ? WHERE id_mongo = ?', [equipoId, idMongo]);
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

function aAcceso(fila: FilaAcceso): AccesoFormulario {
  return {
    registro: aRegistro(fila),
    esPropietario: Boolean(fila.es_propietario),
    rolEquipo: fila.rol_equipo,
    equipoNombre: fila.equipo_nombre,
  };
}
