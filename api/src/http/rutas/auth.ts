import { esquemaLogin, esquemaRegistro } from '@formalista/compartido';
import { Router, type Response } from 'express';
import type { ServicioTokens } from '../../application/puertos.js';
import type { DatosLogin, DatosRegistro, ResultadoAuth, ServicioAuth } from '../../application/servicioAuth.js';
import { COOKIE_SESION, opcionesCookieSesion } from '../cookies.js';
import { autenticar } from '../middlewares/autenticar.js';
import { crearLimitador, type ConfigLimites } from '../middlewares/limites.js';
import { validarCuerpo } from '../middlewares/validar.js';

export function crearRutasAuth(
  servicio: ServicioAuth,
  tokens: ServicioTokens,
  limites: ConfigLimites,
  cookieSegura: boolean,
): Router {
  const router = Router();
  const opcionesCookie = opcionesCookieSesion(cookieSegura);

  /**
   * El navegador guarda el token en la cookie httpOnly. El token también va en el cuerpo para
   * clientes de API sin cookies (REST Client, pruebas); la web lo ignora y nunca lo almacena.
   */
  const iniciarSesion = (res: Response, resultado: ResultadoAuth, status: number) => {
    res.cookie(COOKIE_SESION, resultado.token, opcionesCookie).status(status).json(resultado);
  };

  router.post('/registro', crearLimitador(limites.registro), validarCuerpo(esquemaRegistro), async (req, res) => {
    const datos: DatosRegistro = req.body;
    iniciarSesion(res, await servicio.registrar(datos), 201);
  });

  // Solo cuentan los intentos fallidos: frena la fuerza bruta sin castigar a quien entra bien.
  router.post('/login', crearLimitador(limites.login, { soloFallidos: true }), validarCuerpo(esquemaLogin), async (req, res) => {
    const datos: DatosLogin = req.body;
    iniciarSesion(res, await servicio.login(datos), 200);
  });

  // No exige sesión: cerrar sesión siempre funciona (y es idempotente).
  router.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_SESION, opcionesCookie).status(204).end();
  });

  router.get('/yo', autenticar(tokens), async (req, res) => {
    res.json({ usuario: await servicio.obtenerPerfil(req.usuarioId!) });
  });

  return router;
}
