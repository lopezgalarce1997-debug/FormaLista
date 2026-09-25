import { esquemaActualizacion, esquemaCompartir, esquemaFormulario } from '@formalista/compartido';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ServicioTokens } from '../../application/puertos.js';
import type {
  DatosActualizacion,
  DatosFormulario,
  ServicioFormularios,
} from '../../application/servicioFormularios.js';
import type { ServicioResultados } from '../../application/servicioResultados.js';
import { autenticar } from '../middlewares/autenticar.js';
import { validarConsulta, validarCuerpo } from '../middlewares/validar.js';

// Los esquemas de cuerpo (formulario, actualización, compartir) vienen del paquete compartido,
// para que la web valide con las mismas reglas. Los de query string son propios de la API.

// ---- Query strings de resultados y listado ----

const seleccionVersion = z
  .union([z.literal('todas'), z.coerce.number().int().positive()], 'Debe ser "todas" o un número de versión')
  .default('todas');

/** Zona horaria IANA válida (la misma base de datos de zonas que usa MongoDB). */
function esZonaHoraria(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('es-CL', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

const esquemaResultados = z.object({
  version: seleccionVersion,
  zona: z.string().default('America/Santiago').refine(esZonaHoraria, 'Zona horaria desconocida'),
});

const esquemaListado = z.object({
  version: seleccionVersion,
  pagina: z.coerce.number().int().positive().default(1),
  tamano: z.coerce.number().int().min(1).max(100, 'Máximo 100 por página').default(20),
});

// Con middlewares antes del handler, los tipos de Express no infieren ":id"; se lee explícitamente.
const idDe = (req: Request): string => String(req.params.id);

export function crearRutasFormularios(
  servicio: ServicioFormularios,
  resultados: ServicioResultados,
  tokens: ServicioTokens,
): Router {
  const router = Router();
  router.use(autenticar(tokens));

  router.get('/', async (req, res) => {
    res.json({ formularios: await servicio.listar(req.usuarioId!) });
  });

  router.post('/', validarCuerpo(esquemaFormulario), async (req, res) => {
    const datos: DatosFormulario = req.body;
    res.status(201).json(await servicio.crear(req.usuarioId!, datos));
  });

  router.get('/:id', async (req, res) => {
    res.json(await servicio.obtener(req.usuarioId!, idDe(req)));
  });

  router.put('/:id', validarCuerpo(esquemaActualizacion), async (req, res) => {
    const datos: DatosActualizacion = req.body;
    res.json(await servicio.actualizar(req.usuarioId!, idDe(req), datos));
  });

  router.get('/:id/resultados', validarConsulta(esquemaResultados), async (req, res) => {
    const consulta = res.locals.consulta as z.infer<typeof esquemaResultados>;
    res.json(await resultados.obtenerResultados(req.usuarioId!, idDe(req), consulta));
  });

  router.get('/:id/respuestas', validarConsulta(esquemaListado), async (req, res) => {
    const consulta = res.locals.consulta as z.infer<typeof esquemaListado>;
    res.json(await resultados.listarRespuestas(req.usuarioId!, idDe(req), consulta));
  });

  router.post('/:id/compartir', validarCuerpo(esquemaCompartir), async (req, res) => {
    const { equipoId }: z.infer<typeof esquemaCompartir> = req.body;
    res.json(await servicio.compartir(req.usuarioId!, idDe(req), equipoId));
  });

  router.post('/:id/publicar', async (req, res) => {
    res.json(await servicio.publicar(req.usuarioId!, idDe(req)));
  });

  router.post('/:id/cerrar', async (req, res) => {
    res.json(await servicio.cerrar(req.usuarioId!, idDe(req)));
  });

  router.delete('/:id', async (req, res) => {
    await servicio.eliminar(req.usuarioId!, idDe(req));
    res.status(204).end();
  });

  return router;
}
