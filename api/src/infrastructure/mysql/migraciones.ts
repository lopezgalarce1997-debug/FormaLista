import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Connection, RowDataPacket } from 'mysql2/promise';

const PATRON_ARCHIVO = /^\d{3}_[a-z0-9_]+\.sql$/;

/**
 * Aplica, en orden, los scripts SQL de `directorio` que aún no estén registrados
 * en la tabla schema_migraciones. Devuelve los nombres de las migraciones aplicadas.
 *
 * La conexión debe crearse con `multipleStatements: true`, porque un archivo puede
 * contener varias sentencias.
 */
export async function aplicarMigraciones(conexion: Connection, directorio: string): Promise<string[]> {
  await conexion.query(`
    CREATE TABLE IF NOT EXISTS schema_migraciones (
      nombre VARCHAR(255) NOT NULL PRIMARY KEY,
      aplicada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

  const [filas] = await conexion.query<RowDataPacket[]>('SELECT nombre FROM schema_migraciones');
  const aplicadas = new Set(filas.map((fila) => fila.nombre as string));

  const archivos = (await readdir(directorio)).filter((nombre) => PATRON_ARCHIVO.test(nombre)).sort();
  const pendientes = archivos.filter((nombre) => !aplicadas.has(nombre));

  for (const nombre of pendientes) {
    const sql = await readFile(join(directorio, nombre), 'utf8');
    await conexion.query(sql);
    await conexion.query('INSERT INTO schema_migraciones (nombre) VALUES (?)', [nombre]);
  }

  return pendientes;
}
