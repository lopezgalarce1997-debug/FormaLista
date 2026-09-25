import express, { type Express } from 'express';
import type { ServicioTokens } from '../application/puertos.js';
import type { ServicioAuth } from '../application/servicioAuth.js';
import type { ServicioFormularios } from '../application/servicioFormularios.js';
import type { ServicioPublico } from '../application/servicioPublico.js';
import type { ServicioResultados } from '../application/servicioResultados.js';
import { LIMITES_POR_DEFECTO, type ConfigLimites } from './middlewares/limites.js';
import { manejarErrores, rutaNoEncontrada } from './middlewares/manejarErrores.js';
import { crearRutasAuth } from './rutas/auth.js';
import { crearRutasFormularios } from './rutas/formularios.js';
import { crearRutasPublicas } from './rutas/publico.js';
import { crearRutasSalud, type VerificadorSalud } from './rutas/salud.js';

export interface DependenciasApp {
  verificadoresSalud: VerificadorSalud[];
  servicioAuth: ServicioAuth;
  servicioTokens: ServicioTokens;
  servicioFormularios: ServicioFormularios;
  servicioPublico: ServicioPublico;
  servicioResultados: ServicioResultados;
  /** Opcional: por defecto LIMITES_POR_DEFECTO. Las pruebas lo cambian para no esperar 15 minutos. */
  limites?: Partial<ConfigLimites>;
}

/**
 * Construye la app de Express con sus dependencias ya creadas.
 * No abre conexiones ni escucha puertos: así las pruebas pueden pasarle dobles.
 */
export function crearApp(deps: DependenciasApp): Express {
  const limites: ConfigLimites = { ...LIMITES_POR_DEFECTO, ...deps.limites };

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/salud', crearRutasSalud(deps.verificadoresSalud));
  app.use('/api/auth', crearRutasAuth(deps.servicioAuth, deps.servicioTokens, limites));
  app.use(
    '/api/formularios',
    crearRutasFormularios(deps.servicioFormularios, deps.servicioResultados, deps.servicioTokens),
  );
  app.use('/api/publico', crearRutasPublicas(deps.servicioPublico, limites));

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
