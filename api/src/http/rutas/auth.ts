import { esquemaLogin, esquemaRegistro } from '@formalista/compartido';
import { Router } from 'express';
import type { ServicioTokens } from '../../application/puertos.js';
import type { DatosLogin, DatosRegistro, ServicioAuth } from '../../application/servicioAuth.js';
import { autenticar } from '../middlewares/autenticar.js';
import { crearLimitador, type ConfigLimites } from '../middlewares/limites.js';
import { validarCuerpo } from '../middlewares/validar.js';

export function crearRutasAuth(servicio: ServicioAuth, tokens: ServicioTokens, limites: ConfigLimites): Router {
  const router = Router();

  router.post('/registro', crearLimitador(limites.registro), validarCuerpo(esquemaRegistro), async (req, res) => {
    const datos: DatosRegistro = req.body;
    res.status(201).json(await servicio.registrar(datos));
  });

  // Solo cuentan los intentos fallidos: frena la fuerza bruta sin castigar a quien entra bien.
  router.post('/login', crearLimitador(limites.login, { soloFallidos: true }), validarCuerpo(esquemaLogin), async (req, res) => {
    const datos: DatosLogin = req.body;
    res.json(await servicio.login(datos));
  });

  router.get('/yo', autenticar(tokens), async (req, res) => {
    res.json({ usuario: await servicio.obtenerPerfil(req.usuarioId!) });
  });

  return router;
}
