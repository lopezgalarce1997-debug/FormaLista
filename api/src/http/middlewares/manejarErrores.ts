import type { ErrorRequestHandler, RequestHandler } from 'express';

export const rutaNoEncontrada: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
};

/**
 * Manejador global de errores (equivale al middleware de excepciones de ASP.NET Core).
 * Express lo reconoce por tener 4 parámetros. Nunca expone detalles internos al cliente.
 */
export const manejarErrores: ErrorRequestHandler = (err, _req, res, _next) => {
  // Errores de cliente generados por Express, p. ej. JSON mal formado (status 400).
  const status = typeof err?.status === 'number' ? err.status : 500;
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: 'Solicitud inválida' });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
};
