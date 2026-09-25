// Uso: npm run limpiar-huerfanos
// Borra de MongoDB los formularios y respuestas que no tienen registro en MySQL.
import mongoose from 'mongoose';
import { ANTIGUEDAD_MINIMA_MS, ServicioLimpieza } from '../application/servicioLimpieza.js';
import { cargarArchivoEnv, cargarConfig } from '../config/env.js';
import { conectarMongo } from '../infrastructure/mongo/conexion.js';
import { RepositorioFormulariosMongo } from '../infrastructure/mongo/repositorioFormulariosMongo.js';
import { RepositorioRespuestasMongo } from '../infrastructure/mongo/repositorioRespuestasMongo.js';
import { crearPoolMySql } from '../infrastructure/mysql/pool.js';
import { RepositorioRegistroFormulariosMySql } from '../infrastructure/mysql/repositorioRegistroFormulariosMySql.js';

cargarArchivoEnv();
const config = cargarConfig();

const pool = crearPoolMySql(config.mysql);
await conectarMongo(config.mongoUri);

try {
  const limpieza = new ServicioLimpieza(
    new RepositorioRegistroFormulariosMySql(pool),
    new RepositorioFormulariosMongo(),
    new RepositorioRespuestasMongo(),
  );
  const resultado = await limpieza.limpiarHuerfanos();

  console.log(`Formularios huérfanos (> ${ANTIGUEDAD_MINIMA_MS / 60000} min) eliminados: ${resultado.formulariosEliminados.length}`);
  resultado.formulariosEliminados.forEach((id) => console.log(`  - ${id}`));
  console.log(`Respuestas huérfanas eliminadas: ${resultado.respuestasEliminadas}`);
} finally {
  await Promise.allSettled([pool.end(), mongoose.disconnect()]);
}
