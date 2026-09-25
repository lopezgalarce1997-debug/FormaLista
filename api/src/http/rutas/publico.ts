import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ServicioPublico } from '../../application/servicioPublico.js';
import type { EntradaRespuestas } from '../../domain/respuesta.js';
import { crearLimitador, type ConfigLimites } from '../middlewares/limites.js';
import { validarCuerpo } from '../middlewares/validarCuerpo.js';

// Aquí solo se valida la forma general. El valor de cada respuesta lo valida el dominio
// contra la definición del formulario (validarRespuestas).
const esquemaEnvio = z.object({
  respuestas: z.record(z.string(), z.unknown()),
});

const slugDe = (req: Request): string => String(req.params.slug);

/** Rutas sin autenticación: cualquiera con el link puede ver y responder. */
export function crearRutasPublicas(servicio: ServicioPublico, limites: ConfigLimites): Router {
  const router = Router();

  router.get('/:slug', crearLimitador(limites.lecturaPublica), async (req, res) => {
    res.json(await servicio.obtener(slugDe(req)));
  });

  router.post(
    '/:slug/respuestas',
    crearLimitador(limites.envioRespuestas),
    validarCuerpo(esquemaEnvio),
    async (req, res) => {
      const { respuestas }: { respuestas: EntradaRespuestas } = req.body;
      res.status(201).json(await servicio.responder(slugDe(req), respuestas));
    },
  );

  return router;
}
