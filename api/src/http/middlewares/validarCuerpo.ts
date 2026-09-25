import type { RequestHandler } from 'express';
import type { z } from 'zod';

/**
 * Valida req.body con un esquema Zod. Si es válido, lo reemplaza por los datos ya
 * limpios (trim, valores por defecto); si no, responde 400 con el detalle por campo.
 * Cumple el rol de [ApiController] + DataAnnotations en ASP.NET Core.
 */
export function validarCuerpo(esquema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const resultado = esquema.safeParse(req.body);
    if (!resultado.success) {
      res.status(400).json({
        error: 'Datos inválidos',
        detalles: resultado.error.issues.map((issue) => ({
          campo: issue.path.join('.'),
          mensaje: issue.message,
        })),
      });
      return;
    }
    req.body = resultado.data;
    next();
  };
}
