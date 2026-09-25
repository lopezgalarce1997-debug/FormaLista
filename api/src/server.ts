// Composition root: único lugar donde se crean las dependencias reales y se conectan entre sí
// (equivale a Program.cs + registro de servicios en ASP.NET Core).
import mongoose from 'mongoose';
import { cargarArchivoEnv, cargarConfig } from './config/env.js';
import { crearApp } from './http/app.js';
import { conectarMongo, pingMongo } from './infrastructure/mongo/conexion.js';
import { crearPoolMySql } from './infrastructure/mysql/pool.js';

cargarArchivoEnv();
const config = cargarConfig();

const pool = crearPoolMySql(config.mysql);
await pool.query('SELECT 1'); // falla al arrancar si MySQL no está disponible
const conexionMongo = await conectarMongo(config.mongoUri);

const app = crearApp({
  verificadoresSalud: [
    { nombre: 'mysql', verificar: async () => void (await pool.query('SELECT 1')) },
    { nombre: 'mongo', verificar: () => pingMongo(conexionMongo) },
  ],
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
