import { fileURLToPath } from 'node:url';
import mysql, { type Connection, type Pool } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { cargarArchivoEnv } from '../../src/config/env.js';
import { aplicarMigraciones } from '../../src/infrastructure/mysql/migraciones.js';
import { crearPoolMySql, opcionesMySql } from '../../src/infrastructure/mysql/pool.js';

const DIRECTORIO_MIGRACIONES = fileURLToPath(new URL('../../migrations/', import.meta.url));

/**
 * Conecta a una base MySQL REAL de pruebas (formalista_pruebas por defecto; en CI, un contenedor),
 * aplica las migraciones reales y deja las tablas vacías antes de cada prueba.
 * Usa las credenciales de api/.env (o de las variables de entorno en CI).
 */
export function usarMySqlDePruebas(): { readonly pool: Pool } {
  cargarArchivoEnv();
  const database = process.env.MYSQL_DATABASE_PRUEBAS ?? 'formalista_pruebas';
  // Protección: las pruebas TRUNCAN tablas. Nunca deben correr contra la base de desarrollo.
  if (!database.endsWith('_pruebas')) {
    throw new Error(`Por seguridad, la base de pruebas debe terminar en "_pruebas" (se recibió "${database}")`);
  }
  const config = {
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'formalista',
    password: process.env.MYSQL_PASSWORD ?? '',
    database,
  };

  let pool: Pool;
  let admin: Connection;

  beforeAll(async () => {
    admin = await mysql.createConnection({ ...opcionesMySql(config), multipleStatements: true });
    await admin.query("SET time_zone = '+00:00'");
    await aplicarMigraciones(admin, DIRECTORIO_MIGRACIONES);
    pool = crearPoolMySql(config);
  });

  beforeEach(async () => {
    // FOREIGN_KEY_CHECKS es por sesión: por eso se hace todo en la misma conexión.
    await admin.query(`
      SET FOREIGN_KEY_CHECKS = 0;
      TRUNCATE TABLE equipo_miembros;
      TRUNCATE TABLE formularios_registro;
      TRUNCATE TABLE equipos;
      TRUNCATE TABLE usuarios;
      SET FOREIGN_KEY_CHECKS = 1;`);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.end();
  });

  return {
    get pool() {
      return pool;
    },
  };
}
