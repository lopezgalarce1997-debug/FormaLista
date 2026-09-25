// Composition root: único lugar donde se crean las dependencias reales y se conectan entre sí
// (equivale a Program.cs + registro de servicios en ASP.NET Core).
import mongoose from 'mongoose';
import { ServicioAuth } from './application/servicioAuth.js';
import { ServicioFormularios } from './application/servicioFormularios.js';
import { ServicioPublico } from './application/servicioPublico.js';
import { cargarArchivoEnv, cargarConfig } from './config/env.js';
import { crearApp } from './http/app.js';
import { conectarMongo, pingMongo } from './infrastructure/mongo/conexion.js';
import { RepositorioFormulariosMongo } from './infrastructure/mongo/repositorioFormulariosMongo.js';
import { RepositorioRespuestasMongo } from './infrastructure/mongo/repositorioRespuestasMongo.js';
import { crearPoolMySql } from './infrastructure/mysql/pool.js';
import { RepositorioRegistroFormulariosMySql } from './infrastructure/mysql/repositorioRegistroFormulariosMySql.js';
import { RepositorioUsuariosMySql } from './infrastructure/mysql/repositorioUsuariosMySql.js';
import { HasheadorBcrypt } from './infrastructure/seguridad/hasheadorBcrypt.js';
import { ServicioTokensJwt } from './infrastructure/seguridad/servicioTokensJwt.js';

cargarArchivoEnv();
const config = cargarConfig();

const pool = crearPoolMySql(config.mysql);
await pool.query('SELECT 1'); // falla al arrancar si MySQL no está disponible
const conexionMongo = await conectarMongo(config.mongoUri);

const servicioTokens = new ServicioTokensJwt(config.jwt.secreto, config.jwt.expiraEn);
const servicioAuth = new ServicioAuth(new RepositorioUsuariosMySql(pool), new HasheadorBcrypt(), servicioTokens);
const repoRegistro = new RepositorioRegistroFormulariosMySql(pool);
const repoFormularios = new RepositorioFormulariosMongo();
const repoRespuestas = new RepositorioRespuestasMongo();
const servicioFormularios = new ServicioFormularios(repoRegistro, repoFormularios, repoRespuestas, console);
const servicioPublico = new ServicioPublico(repoRegistro, repoFormularios, repoRespuestas);

const app = crearApp({
  verificadoresSalud: [
    { nombre: 'mysql', verificar: async () => void (await pool.query('SELECT 1')) },
    { nombre: 'mongo', verificar: () => pingMongo(conexionMongo) },
  ],
  servicioAuth,
  servicioTokens,
  servicioFormularios,
  servicioPublico,
  limites: { envioRespuestas: config.limiteRespuestas },
});

const servidor = app.listen(config.puerto, () => {
  console.log(`API escuchando en http://localhost:${config.puerto}`);
});

async function cerrar(): Promise<void> {
  console.log('Cerrando servidor...');
  servidor.close();
  await Promise.allSettled([pool.end(), mongoose.disconnect()]);
  process.exit(0);
}

process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
