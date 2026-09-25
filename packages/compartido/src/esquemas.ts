// Esquemas Zod de ENTRADA de la API. Los usan la API (para validar cada petición) y la web
// (para validar los formularios antes de enviarlos): una sola fuente de verdad.
// Zod valida la FORMA (tipos, largos). Las reglas de negocio viven en dominio/.
import { z } from 'zod';
import { ROLES_EQUIPO, type RolEquipo } from './dominio/permisos.js';

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------

/** bcrypt solo considera los primeros 72 bytes: más allá, dos contraseñas distintas darían el mismo hash. */
export const MAX_BYTES_PASSWORD = 72;

// TextEncoder (no Buffer) para que funcione igual en Node y en el navegador.
const bytesUtf8 = (texto: string) => new TextEncoder().encode(texto).length;

export const esquemaRegistro = z.object({
  nombre: z.string().trim().min(1, 'Es obligatorio').max(100, 'Máximo 100 caracteres'),
  email: z.email('Email inválido').max(255, 'Máximo 255 caracteres'),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .refine((p) => bytesUtf8(p) <= MAX_BYTES_PASSWORD, 'Máximo 72 bytes'),
});

// En el login no se repiten las reglas de formato: solo se exige que venga algo.
export const esquemaLogin = z.object({
  email: z.string().min(1, 'Es obligatorio').max(255),
  password: z.string().min(1, 'Es obligatorio').max(1024),
});

// ---------------------------------------------------------------------------
// Formularios
// ---------------------------------------------------------------------------

const base = {
  id: z.string().trim().min(1).max(64).optional(),
  texto: z.string().trim().min(1, 'Es obligatorio').max(500, 'Máximo 500 caracteres'),
  obligatoria: z.boolean().default(false),
};
const opciones = z.array(z.string().trim().min(1, 'La opción no puede estar vacía').max(200)).max(50);
const valorEscala = z.number().int().min(0).max(10);

export const esquemaPregunta = z.discriminatedUnion('tipo', [
  z.object({ ...base, tipo: z.literal('texto_corto') }),
  z.object({ ...base, tipo: z.literal('texto_largo') }),
  z.object({ ...base, tipo: z.literal('fecha') }),
  z.object({ ...base, tipo: z.literal('opcion_unica'), opciones }),
  z.object({ ...base, tipo: z.literal('opcion_multiple'), opciones }),
  z.object({ ...base, tipo: z.literal('escala'), minimo: valorEscala.default(1), maximo: valorEscala.default(5) }),
]);

// z.object descarta los campos que no declara: el cliente no puede fijar slug ni estado.
export const esquemaFormulario = z.object({
  titulo: z.string().trim().min(1, 'Es obligatorio').max(200, 'Máximo 200 caracteres'),
  descripcion: z.string().trim().max(2000, 'Máximo 2000 caracteres').default(''),
  preguntas: z.array(esquemaPregunta).max(100, 'Máximo 100 preguntas').default([]),
});

// Al editar, `version` es obligatoria: es la versión que el cliente tenía abierta (concurrencia
// optimista). No fija la versión: el servidor la compara con la vigente y decide si sube.
export const esquemaActualizacion = esquemaFormulario.extend({
  version: z.number('Es obligatoria (la versión que estabas editando)').int().positive(),
});

// equipoId es obligatorio para que "dejar de compartir" sea explícito: { "equipoId": null }.
export const esquemaCompartir = z.object({
  equipoId: z.number('Indica el equipo (o null para dejar de compartir)').int().positive().nullable(),
});

// ---------------------------------------------------------------------------
// Respuestas públicas
// ---------------------------------------------------------------------------

// Solo la forma general. El valor de cada respuesta lo valida el dominio (validarRespuestas)
// contra la definición del formulario.
export const esquemaEnvio = z.object({
  respuestas: z.record(z.string(), z.unknown()),
  /** Versión que vio quien responde (viene en el GET público). Si se omite, se usa la vigente. */
  version: z.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// Equipos
// ---------------------------------------------------------------------------

export const esquemaRol = z.enum(ROLES_EQUIPO as [RolEquipo, ...RolEquipo[]], 'Debe ser propietario, editor o lector');

export const esquemaEquipo = z.object({
  nombre: z.string().trim().min(1, 'Es obligatorio').max(100, 'Máximo 100 caracteres'),
});
export const esquemaNuevoMiembro = z.object({ email: z.email('Email inválido').max(255), rol: esquemaRol });
export const esquemaCambioRol = z.object({ rol: esquemaRol });

// ---------------------------------------------------------------------------
// Tipos derivados (lo que queda DESPUÉS de validar: con trim y valores por defecto aplicados)
// ---------------------------------------------------------------------------

export type DatosRegistro = z.output<typeof esquemaRegistro>;
export type DatosLogin = z.output<typeof esquemaLogin>;
export type DatosCompartir = z.output<typeof esquemaCompartir>;
export type DatosEnvio = z.output<typeof esquemaEnvio>;
export type DatosNuevoMiembro = z.output<typeof esquemaNuevoMiembro>;
