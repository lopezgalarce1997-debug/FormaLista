// Uso: npm run migrar  (aplica los scripts pendientes de api/migrations)
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { cargarArchivoEnv, cargarConfig } from '../config/env.js';
import { aplicarMigraciones } from '../infrastructure/mysql/migraciones.js';
import { opcionesMySql } from '../infrastructure/mysql/pool.js';

const DIRECTORIO_MIGRACIONES = fileURLToPath(new URL('../../migrations/', import.meta.url));

cargarArchivoEnv();
const config = cargarConfig();

// multipleStatements solo aquí: en el pool de la app queda desactivado para
// reducir el impacto de una posible inyección SQL.
const conexion = await mysql.createConnection({ ...opcionesMySql(config.mysql), multipleStatements: true });
try {
  await conexion.query("SET time_zone = '+00:00'");
  const aplicadas = await aplicarMigraciones(conexion, DIRECTORIO_MIGRACIONES);
  if (aplicadas.length === 0) {
    console.log('La base de datos ya está al día.');
  } else {
    aplicadas.forEach((nombre) => console.log(`✔ ${nombre}`));
  }
} finally {
  await conexion.end();
}
