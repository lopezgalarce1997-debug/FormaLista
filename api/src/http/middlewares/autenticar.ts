import type { RequestHandler } from 'express';
import { ErrorAplicacion } from '../../application/errores.js';
import type { ServicioTokens } from '../../application/puertos.js';
import { COOKIE_SESION, leerCookie } from '../cookies.js';

/**
 * Exige un token válido (como [Authorize] en ASP.NET Core). Lo busca en:
 * 1. El header "Authorization: Bearer <token>" (clientes de API: REST Client, pruebas, integraciones).
 * 2. La cookie httpOnly de sesión (el navegador, que nunca ve el token).
 */
export function autenticar(tokens: ServicioTokens): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : leerCookie(req, COOKIE_SESION);
    if (!token) throw new ErrorAplicacion('no_autorizado', 'Falta el token de acceso');

    req.usuarioId = await tokens.verificar(token);
    next();
  };
}
