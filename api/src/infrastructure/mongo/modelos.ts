import { model, Schema, type Types } from 'mongoose';
import { TIPOS_PREGUNTA, type TipoPregunta } from '../../domain/formulario.js';

// ---- Forma de los documentos tal como se guardan en MongoDB ----

export interface DocPregunta {
  id: string;
  tipo: TipoPregunta;
  texto: string;
  obligatoria: boolean;
  opciones?: string[];
  minimo?: number;
  maximo?: number;
}

export interface DocVersion {
  version: number;
  preguntas: DocPregunta[];
  reemplazadaEn: Date;
}

export interface DocFormulario {
  _id: Types.ObjectId;
  titulo: string;
  descripcion: string;
  slug: string;
  version: number;
  preguntas: DocPregunta[];
  /** Historial: solo las versiones ANTERIORES a la vigente. */
  versiones: DocVersion[];
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface DocRespuesta {
  _id: Types.ObjectId;
  formularioId: Types.ObjectId;
  version: number;
  respuestas: { preguntaId: string; valor: unknown }[];
  enviadaEn: Date;
}

// ---- Esquemas ----

// Un solo esquema para todos los tipos: los campos que no aplican (p. ej. opciones en una fecha)
// simplemente no se guardan. La forma exacta por tipo la garantizan Zod (entrada) y el dominio.
const esquemaPregunta = new Schema<DocPregunta>(
  {
    id: { type: String, required: true },
    tipo: { type: String, enum: TIPOS_PREGUNTA, required: true },
    texto: { type: String, required: true },
    obligatoria: { type: Boolean, default: false },
    opciones: { type: [String], default: undefined },
    minimo: Number,
    maximo: Number,
  },
  { _id: false },
);

const esquemaVersion = new Schema<DocVersion>(
  {
    version: { type: Number, required: true },
    preguntas: { type: [esquemaPregunta], default: [] },
    reemplazadaEn: { type: Date, required: true },
  },
  { _id: false },
);

const esquemaFormulario = new Schema<DocFormulario>(
  {
    titulo: { type: String, required: true },
    descripcion: { type: String, default: '' },
    slug: { type: String, required: true, unique: true },
    version: { type: Number, default: 1 },
    preguntas: { type: [esquemaPregunta], default: [] },
    versiones: { type: [esquemaVersion], default: [] },
  },
  {
    collection: 'formularios',
    timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
    versionKey: false,
  },
);

// Cada valor ya viene validado y normalizado por el dominio (texto, número o lista de textos).
const esquemaRespuesta = new Schema<DocRespuesta>(
  {
    formularioId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true },
    respuestas: {
      type: [{ _id: false, preguntaId: { type: String, required: true }, valor: Schema.Types.Mixed }],
      default: [],
    },
    enviadaEn: { type: Date, default: Date.now },
  },
  { collection: 'respuestas', versionKey: false },
);

// Índices compuestos (reemplazan al índice simple de formularioId, que es prefijo de ambos):
// - "todas las versiones": filtra por formulario y ordena por fecha (listado, borrado, estadísticas).
// - "una versión": filtra por formulario + versión y ordena por fecha.
esquemaRespuesta.index({ formularioId: 1, enviadaEn: -1 });
esquemaRespuesta.index({ formularioId: 1, version: 1, enviadaEn: -1 });

export const ModeloFormulario = model<DocFormulario>('Formulario', esquemaFormulario);
export const ModeloRespuesta = model<DocRespuesta>('Respuesta', esquemaRespuesta);
