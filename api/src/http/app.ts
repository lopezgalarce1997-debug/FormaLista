import express, { type Express } from 'express';
import type { ServicioTokens } from '../application/puertos.js';
import type { ServicioAuth } from '../application/servicioAuth.js';
import { manejarErrores, rutaNoEncontrada } from './middlewares/manejarErrores.js';
import { crearRutasAuth } from './rutas/auth.js';
import { crearRutasSalud, type VerificadorSalud } from './rutas/salud.js';

export interface DependenciasApp {
  verificadoresSalud: VerificadorSalud[];
  servicioAuth: ServicioAuth;
  servicioTokens: ServicioTokens;
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
  app.use('/api/auth', crearRutasAuth(deps.servicioAuth, deps.servicioTokens));

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
