import express, { type Express } from 'express';
import { manejarErrores, rutaNoEncontrada } from './middlewares/manejarErrores.js';
import { crearRutasSalud, type VerificadorSalud } from './rutas/salud.js';

export interface DependenciasApp {
  verificadoresSalud: VerificadorSalud[];
}

/**
 * Construye la app de Express con sus dependencias ya creadas.
 * No abre conexiones ni escucha puertos: así las pruebas pueden pasarle dobles.
 */
export function crearApp(deps: DependenciasApp): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/salud', crearRutasSalud(deps.verificadoresSalud));

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
