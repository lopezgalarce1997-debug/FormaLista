import { Router, type Request } from 'express';
import { z } from 'zod';
import { ErrorAplicacion } from '../../application/errores.js';
import type { ServicioTokens } from '../../application/puertos.js';
import type { ServicioEquipos } from '../../application/servicioEquipos.js';
import { ROLES_EQUIPO, type RolEquipo } from '../../domain/permisos.js';
import { autenticar } from '../middlewares/autenticar.js';
import { validarCuerpo } from '../middlewares/validar.js';

const rol = z.enum(ROLES_EQUIPO as [RolEquipo, ...RolEquipo[]], 'Debe ser propietario, editor o lector');

const esquemaEquipo = z.object({
  nombre: z.string().trim().min(1, 'Es obligatorio').max(100, 'Máximo 100 caracteres'),
});
const esquemaNuevoMiembro = z.object({ email: z.email('Email inválido').max(255), rol });
const esquemaCambioRol = z.object({ rol });

/** Lee un id numérico de la ruta; si no es un entero positivo, el recurso no existe (404). */
function idNumerico(req: Request, parametro: string, recurso: string): number {
  const valor = Number(req.params[parametro]);
  if (!Number.isInteger(valor) || valor <= 0) throw new ErrorAplicacion('no_encontrado', `${recurso} no encontrado`);
  return valor;
}

export function crearRutasEquipos(servicio: ServicioEquipos, tokens: ServicioTokens): Router {
  const router = Router();
  router.use(autenticar(tokens));
  const equipoId = (req: Request) => idNumerico(req, 'id', 'Equipo');
  const miembroId = (req: Request) => idNumerico(req, 'usuarioId', 'Miembro');

  router.post('/', validarCuerpo(esquemaEquipo), async (req, res) => {
    res.status(201).json(await servicio.crear(req.usuarioId!, req.body.nombre));
  });

  router.get('/', async (req, res) => {
    res.json({ equipos: await servicio.listar(req.usuarioId!) });
  });

  router.get('/:id', async (req, res) => {
    res.json(await servicio.obtener(req.usuarioId!, equipoId(req)));
  });

  router.post('/:id/miembros', validarCuerpo(esquemaNuevoMiembro), async (req, res) => {
    const { email, rol: nuevoRol }: z.infer<typeof esquemaNuevoMiembro> = req.body;
    res.status(201).json(await servicio.agregarMiembro(req.usuarioId!, equipoId(req), email, nuevoRol));
  });

  router.patch('/:id/miembros/:usuarioId', validarCuerpo(esquemaCambioRol), async (req, res) => {
    const { rol: nuevoRol }: z.infer<typeof esquemaCambioRol> = req.body;
    res.json(await servicio.cambiarRol(req.usuarioId!, equipoId(req), miembroId(req), nuevoRol));
  });

  router.delete('/:id/miembros/:usuarioId', async (req, res) => {
    await servicio.quitarMiembro(req.usuarioId!, equipoId(req), miembroId(req));
    res.status(204).end();
  });

  return router;
}
