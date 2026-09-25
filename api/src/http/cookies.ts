import type { CookieOptions, Request } from 'express';

export const COOKIE_SESION = 'formalista_sesion';

/**
 * - httpOnly: el JavaScript de la página no puede leerla → un XSS no puede robar el token.
 * - sameSite 'strict': el navegador no la envía en peticiones iniciadas desde otro sitio → protege
 *   contra CSRF sin necesidad de un token anti-CSRF.
 * - secure: solo por HTTPS (en producción; en desarrollo local se usa http).
 * - path /api: solo viaja a la API, no a los archivos estáticos.
 * Sin maxAge: es una cookie de sesión; la validez real la define la expiración del JWT que contiene.
 */
export function opcionesCookieSesion(segura: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure: segura, path: '/api' };
}

/** Lee una cookie del header Cookie (Express 5 no las parsea por sí mismo). */
export function leerCookie(req: Request, nombre: string): string | undefined {
  const encabezado = req.headers.cookie;
  if (!encabezado) return undefined;
  for (const par of encabezado.split(';')) {
    const separador = par.indexOf('=');
    if (separador === -1) continue;
    if (par.slice(0, separador).trim() === nombre) {
      try {
        return decodeURIComponent(par.slice(separador + 1).trim());
      } catch {
        return undefined; // valor mal codificado: se trata como ausente
      }
    }
  }
  return undefined;
}
