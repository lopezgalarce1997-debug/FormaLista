import { esquemaEnvio, type DatosEnvio } from '@formalista/compartido';
import { Router, type Request } from 'express';
import type { ServicioPublico } from '../../application/servicioPublico.js';
import { crearLimitador, type ConfigLimites } from '../middlewares/limites.js';
import { validarCuerpo } from '../middlewares/validar.js';

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
      const { respuestas, version }: DatosEnvio = req.body;
      res.status(201).json(await servicio.responder(slugDe(req), respuestas, version));
    },
  );

  return router;
}
