import { Router } from 'express';
import { z } from 'zod';
import type { ServicioTokens } from '../../application/puertos.js';
import type { DatosLogin, DatosRegistro, ServicioAuth } from '../../application/servicioAuth.js';
import { autenticar } from '../middlewares/autenticar.js';
import { crearLimitador, type ConfigLimites } from '../middlewares/limites.js';
import { validarCuerpo } from '../middlewares/validar.js';

// bcrypt solo considera los primeros 72 bytes: más allá, dos contraseñas distintas darían el mismo hash.
const MAX_BYTES_PASSWORD = 72;

const esquemaRegistro = z.object({
  nombre: z.string().trim().min(1, 'Es obligatorio').max(100, 'Máximo 100 caracteres'),
  email: z.email('Email inválido').max(255, 'Máximo 255 caracteres'),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .refine((p) => Buffer.byteLength(p, 'utf8') <= MAX_BYTES_PASSWORD, 'Máximo 72 bytes'),
});

// En el login no se repiten las reglas de formato: solo se exige que venga algo.
const esquemaLogin = z.object({
  email: z.string().min(1, 'Es obligatorio').max(255),
  password: z.string().min(1, 'Es obligatorio').max(1024),
});

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
