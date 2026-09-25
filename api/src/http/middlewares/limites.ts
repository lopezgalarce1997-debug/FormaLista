import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';

export interface Limite {
  ventanaMs: number;
  maximo: number;
}

export interface ConfigLimites {
  /** Intentos de login FALLIDOS por IP (los exitosos no cuentan). */
  login: Limite;
  registro: Limite;
  lecturaPublica: Limite;
  envioRespuestas: Limite;
}

const MINUTO = 60 * 1000;

export const LIMITES_POR_DEFECTO: ConfigLimites = {
  login: { ventanaMs: 15 * MINUTO, maximo: 10 },
  registro: { ventanaMs: 60 * MINUTO, maximo: 10 },
  lecturaPublica: { ventanaMs: 15 * MINUTO, maximo: 100 },
  // Holgado a propósito: una sala de clases o una oficina puede responder desde una misma IP.
  // En server.ts se toma de LIMITE_RESPUESTAS_* (.env).
  envioRespuestas: { ventanaMs: 15 * MINUTO, maximo: 60 },
};

/**
 * Limitador por IP con contadores EN MEMORIA (store por defecto de express-rate-limit).
 * Cada llamada crea un contador independiente. Con varias instancias de la API, cada una
 * contaría por separado: ahí se usaría un store compartido como Redis (ver README).
 */
export function crearLimitador(limite: Limite, opciones: { soloFallidos?: boolean } = {}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: limite.ventanaMs,
    limit: limite.maximo,
    skipSuccessfulRequests: opciones.soloFallidos ?? false,
    standardHeaders: 'draft-8', // header RateLimit estándar (IETF): el cliente sabe cuánto le queda
    legacyHeaders: false, // sin los antiguos X-RateLimit-*
    handler: (_req, res) => {
      res.status(429).json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' });
    },
  });
}
