import mysql, { type Pool, type PoolOptions } from 'mysql2/promise';
import type { Config } from '../../config/env.js';

/**
 * Opciones comunes para el pool de la app y la conexión de migraciones.
 * timezone 'Z' hace que mysql2 convierta las fechas de JS a/desde UTC.
 */
export function opcionesMySql(config: Config['mysql']): PoolOptions {
  return { ...config, timezone: 'Z', charset: 'utf8mb4' };
}

export function crearPoolMySql(config: Config['mysql']): Pool {
  const pool = mysql.createPool({ ...opcionesMySql(config), connectionLimit: 10 });

  // Cada conexión nueva trabaja en UTC, así CURRENT_TIMESTAMP guarda la hora UTC
  // sin importar la zona horaria del servidor MySQL.
  pool.on('connection', (conexion) => {
    conexion.query("SET time_zone = '+00:00'");
  });

  return pool;
}
