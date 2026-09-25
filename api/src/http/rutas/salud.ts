import { Router } from 'express';

export interface VerificadorSalud {
  nombre: string;
  verificar: () => Promise<void>;
}

/** GET /api/salud: indica si la API puede comunicarse con cada base de datos. */
export function crearRutasSalud(verificadores: VerificadorSalud[]): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const resultados = await Promise.allSettled(verificadores.map((v) => v.verificar()));

    const servicios: Record<string, 'ok' | 'error'> = {};
    verificadores.forEach((v, i) => {
      servicios[v.nombre] = resultados[i]?.status === 'fulfilled' ? 'ok' : 'error';
    });

    const todoOk = Object.values(servicios).every((estado) => estado === 'ok');
    res.status(todoOk ? 200 : 503).json({ estado: todoOk ? 'ok' : 'degradado', servicios });
  });

  return router;
}
