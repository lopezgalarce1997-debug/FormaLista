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

export interface DocFormulario {
  _id: Types.ObjectId;
  titulo: string;
  descripcion: string;
  slug: string;
  version: number;
  preguntas: DocPregunta[];
  creadoEn: Date;
  actualizadoEn: Date;
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

const esquemaFormulario = new Schema<DocFormulario>(
  {
    titulo: { type: String, required: true },
    descripcion: { type: String, default: '' },
    slug: { type: String, required: true, unique: true },
    version: { type: Number, default: 1 },
    preguntas: { type: [esquemaPregunta], default: [] },
  },
  {
    collection: 'formularios',
    timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
    versionKey: false,
  },
);

// Estructura mínima de una respuesta; el paso 7 la completa al implementar el envío.
const esquemaRespuesta = new Schema(
  {
    formularioId: { type: Schema.Types.ObjectId, required: true, index: true },
    version: { type: Number, required: true },
    respuestas: {
      type: [{ _id: false, preguntaId: { type: String, required: true }, valor: Schema.Types.Mixed }],
      default: [],
    },
    enviadaEn: { type: Date, default: Date.now },
  },
  { collection: 'respuestas', versionKey: false },
);

export const ModeloFormulario = model<DocFormulario>('Formulario', esquemaFormulario);
export const ModeloRespuesta = model('Respuesta', esquemaRespuesta);
