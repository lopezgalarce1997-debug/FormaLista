import { existsSync } from 'node:fs';
import { z } from 'zod';

const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string(),
  MYSQL_DATABASE: z.string().min(1),

  MONGODB_URI: z.string().startsWith('mongodb'),

  JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('1h'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Límite de envíos de respuestas públicas por IP.
  LIMITE_RESPUESTAS_MAXIMO: z.coerce.number().int().positive().default(60),
  LIMITE_RESPUESTAS_VENTANA_MINUTOS: z.coerce.number().int().positive().default(15),
});

export interface Config {
  entorno: 'development' | 'test' | 'production';
  puerto: number;
  mysql: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  mongoUri: string;
  jwt: { secreto: string; expiraEn: string };
  corsOrigen: string;
  limiteRespuestas: { ventanaMs: number; maximo: number };
}

/** Carga api/.env en process.env si existe (en CI las variables vienen del entorno). */
export function cargarArchivoEnv(ruta = '.env'): void {
  if (existsSync(ruta)) process.loadEnvFile(ruta);
}

/** Valida las variables de entorno al arrancar: si falta algo, falla de inmediato con un mensaje claro. */
export function cargarConfig(fuente: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquemaEnv.safeParse(fuente);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida:\n${detalle}`);
  }

  const env = resultado.data;
  return {
    entorno: env.NODE_ENV,
    puerto: env.PORT,
    mysql: {
      host: env.MYSQL_HOST,
      port: env.MYSQL_PORT,
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
      database: env.MYSQL_DATABASE,
    },
    mongoUri: env.MONGODB_URI,
    jwt: { secreto: env.JWT_SECRET, expiraEn: env.JWT_EXPIRES_IN },
    corsOrigen: env.CORS_ORIGIN,
    limiteRespuestas: {
      ventanaMs: env.LIMITE_RESPUESTAS_VENTANA_MINUTOS * 60 * 1000,
      maximo: env.LIMITE_RESPUESTAS_MAXIMO,
    },
  };
}
