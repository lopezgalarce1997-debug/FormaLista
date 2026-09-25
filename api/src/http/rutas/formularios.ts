import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ServicioTokens } from '../../application/puertos.js';
import type { DatosFormulario, ServicioFormularios } from '../../application/servicioFormularios.js';
import { autenticar } from '../middlewares/autenticar.js';
import { validarCuerpo } from '../middlewares/validarCuerpo.js';

// Zod valida la FORMA (tipos, largos máximos). Las reglas de negocio (mínimo 2 opciones,
// opciones sin repetir, escala con mínimo < máximo) están en domain/formulario.ts.
const base = {
  id: z.string().trim().min(1).max(64).optional(),
  texto: z.string().trim().min(1, 'Es obligatorio').max(500, 'Máximo 500 caracteres'),
  obligatoria: z.boolean().default(false),
};
const opciones = z.array(z.string().trim().min(1, 'La opción no puede estar vacía').max(200)).max(50);
const valorEscala = z.number().int().min(0).max(10);

const esquemaPregunta = z.discriminatedUnion('tipo', [
  z.object({ ...base, tipo: z.literal('texto_corto') }),
  z.object({ ...base, tipo: z.literal('texto_largo') }),
  z.object({ ...base, tipo: z.literal('fecha') }),
  z.object({ ...base, tipo: z.literal('opcion_unica'), opciones }),
  z.object({ ...base, tipo: z.literal('opcion_multiple'), opciones }),
  z.object({ ...base, tipo: z.literal('escala'), minimo: valorEscala.default(1), maximo: valorEscala.default(5) }),
]);

// z.object descarta los campos que no declara: el cliente no puede fijar slug, version ni estado.
const esquemaFormulario = z.object({
  titulo: z.string().trim().min(1, 'Es obligatorio').max(200, 'Máximo 200 caracteres'),
  descripcion: z.string().trim().max(2000, 'Máximo 2000 caracteres').default(''),
  preguntas: z.array(esquemaPregunta).max(100, 'Máximo 100 preguntas').default([]),
});

// Con middlewares antes del handler, los tipos de Express no infieren ":id"; se lee explícitamente.
const idDe = (req: Request): string => String(req.params.id);

export function crearRutasFormularios(servicio: ServicioFormularios, tokens: ServicioTokens): Router {
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

  router.put('/:id', validarCuerpo(esquemaFormulario), async (req, res) => {
    const datos: DatosFormulario = req.body;
    res.json(await servicio.actualizar(req.usuarioId!, idDe(req), datos));
  });

  router.delete('/:id', async (req, res) => {
    await servicio.eliminar(req.usuarioId!, idDe(req));
    res.status(204).end();
  });

  return router;
}
