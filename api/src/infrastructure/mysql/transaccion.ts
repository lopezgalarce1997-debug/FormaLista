import type { Pool, PoolConnection } from 'mysql2/promise';

/**
 * Ejecuta `trabajo` dentro de una transacción con una conexión exclusiva del pool.
 * Si `trabajo` lanza un error, hace ROLLBACK y lo propaga; si no, COMMIT.
 * (Equivale a BeginTransaction/Commit/Rollback de un DbContext o SqlTransaction en .NET.)
 */
export async function enTransaccion<T>(pool: Pool, trabajo: (conexion: PoolConnection) => Promise<T>): Promise<T> {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await trabajo(conexion);
    await conexion.commit();
    return resultado;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release(); // la conexión vuelve al pool siempre
  }
}
