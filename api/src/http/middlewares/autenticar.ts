import type { RequestHandler } from 'express';
import { ErrorAplicacion } from '../../application/errores.js';
import type { ServicioTokens } from '../../application/puertos.js';

/** Exige un header "Authorization: Bearer <token>" válido (como [Authorize] en ASP.NET Core). */
export function autenticar(tokens: ServicioTokens): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new ErrorAplicacion('no_autorizado', 'Falta el token de acceso');
    }
    req.usuarioId = await tokens.verificar(header.slice('Bearer '.length));
    next();
  };
}
