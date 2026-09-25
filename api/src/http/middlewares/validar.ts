import type { RequestHandler, Response } from 'express';
import type { z } from 'zod';

/**
 * Valida req.body con un esquema Zod. Si es válido, lo reemplaza por los datos ya
 * limpios (trim, valores por defecto); si no, responde 400 con el detalle por campo.
 * Cumple el rol de [ApiController] + DataAnnotations en ASP.NET Core.
 */
export function validarCuerpo(esquema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const resultado = esquema.safeParse(req.body);
    if (!resultado.success) return responderInvalido(res, resultado.error);
    req.body = resultado.data;
    next();
  };
}

/**
 * Valida el query string. En Express 5 req.query es de solo lectura, así que los datos
 * ya convertidos (números, valores por defecto) quedan en res.locals.consulta.
 */
export function validarConsulta(esquema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const resultado = esquema.safeParse(req.query);
    if (!resultado.success) return responderInvalido(res, resultado.error);
    res.locals.consulta = resultado.data;
    next();
  };
}

function responderInvalido(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: 'Datos inválidos',
    detalles: error.issues.map((issue) => ({ campo: issue.path.join('.'), mensaje: issue.message })),
  });
}
