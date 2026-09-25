import { Types } from 'mongoose';
import type { ContenidoFormulario, RepositorioFormularios } from '../../application/puertos.js';
import type { Formulario, Pregunta } from '../../domain/formulario.js';
import { ModeloFormulario, type DocFormulario, type DocPregunta } from './modelos.js';

export class RepositorioFormulariosMongo implements RepositorioFormularios {
  async crear(datos: ContenidoFormulario & { slug: string }): Promise<Formulario> {
    const documento = await ModeloFormulario.create(datos);
    return aFormulario(documento.toObject());
  }

  async buscarPorId(id: string): Promise<Formulario | null> {
    const documento = await ModeloFormulario.findById(id).lean<DocFormulario>();
    return documento ? aFormulario(documento) : null;
  }

  async buscarPorSlug(slug: string): Promise<Formulario | null> {
    // Usa el índice único de slug.
    const documento = await ModeloFormulario.findOne({ slug }).lean<DocFormulario>();
    return documento ? aFormulario(documento) : null;
  }

  async buscarPorIds(ids: string[]): Promise<Formulario[]> {
    const documentos = await ModeloFormulario.find({ _id: { $in: ids } }).lean<DocFormulario[]>();
    return documentos.map(aFormulario);
  }

  async actualizar(id: string, datos: ContenidoFormulario): Promise<Formulario | null> {
    // $set reemplaza el arreglo completo de preguntas; actualizadoEn lo mantiene Mongoose (timestamps).
    const documento = await ModeloFormulario.findByIdAndUpdate(
      id,
      { $set: datos },
      { returnDocument: 'after', runValidators: true },
    ).lean<DocFormulario>();
    return documento ? aFormulario(documento) : null;
  }

  async eliminar(id: string): Promise<void> {
    await ModeloFormulario.deleteOne({ _id: id });
  }

  async listarIdsCreadosAntesDe(fecha: Date): Promise<string[]> {
    // El ObjectId lleva la fecha de creación en sus primeros 4 bytes: se filtra por _id, sin otro índice.
    const limite = Types.ObjectId.createFromTime(Math.floor(fecha.getTime() / 1000));
    const documentos = await ModeloFormulario.find({ _id: { $lt: limite } }, { _id: 1 }).lean<
      Pick<DocFormulario, '_id'>[]
    >();
    return documentos.map((d) => d._id.toString());
  }
}

function aFormulario(doc: DocFormulario): Formulario {
  return {
    id: doc._id.toString(),
    titulo: doc.titulo,
    descripcion: doc.descripcion,
    slug: doc.slug,
    version: doc.version,
    preguntas: doc.preguntas.map(aPregunta),
    creadoEn: doc.creadoEn,
    actualizadoEn: doc.actualizadoEn,
  };
}

function aPregunta(doc: DocPregunta): Pregunta {
  const base = { id: doc.id, texto: doc.texto, obligatoria: doc.obligatoria };
  switch (doc.tipo) {
    case 'opcion_unica':
    case 'opcion_multiple':
      return { ...base, tipo: doc.tipo, opciones: doc.opciones ?? [] };
    case 'escala':
      return { ...base, tipo: 'escala', minimo: doc.minimo ?? 1, maximo: doc.maximo ?? 5 };
    default:
      return { ...base, tipo: doc.tipo };
  }
}
