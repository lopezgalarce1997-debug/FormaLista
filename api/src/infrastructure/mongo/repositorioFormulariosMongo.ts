import { Types, type UpdateQuery } from 'mongoose';
import type { ContenidoFormulario, ControlEdicion, RepositorioFormularios } from '../../application/puertos.js';
import type { Formulario, Pregunta, VersionFormulario } from '../../domain/formulario.js';
import { ModeloFormulario, type DocFormulario, type DocPregunta } from './modelos.js';

/** Proyección para lecturas normales: el historial puede ser grande y casi nunca se necesita. */
const SIN_HISTORIAL = { versiones: 0 } as const;

export class RepositorioFormulariosMongo implements RepositorioFormularios {
  async crear(datos: ContenidoFormulario & { slug: string }): Promise<Formulario> {
    const documento = await ModeloFormulario.create(datos);
    return aFormulario(documento.toObject());
  }

  async buscarPorId(id: string): Promise<Formulario | null> {
    const documento = await ModeloFormulario.findById(id, SIN_HISTORIAL).lean<DocFormulario>();
    return documento ? aFormulario(documento) : null;
  }

  async buscarPorSlug(slug: string): Promise<Formulario | null> {
    // Usa el índice único de slug.
    const documento = await ModeloFormulario.findOne({ slug }, SIN_HISTORIAL).lean<DocFormulario>();
    return documento ? aFormulario(documento) : null;
  }

  async buscarPorIds(ids: string[]): Promise<Formulario[]> {
    const documentos = await ModeloFormulario.find({ _id: { $in: ids } }, SIN_HISTORIAL).lean<DocFormulario[]>();
    return documentos.map(aFormulario);
  }

  async actualizar(id: string, datos: ContenidoFormulario, control: ControlEdicion): Promise<Formulario | null> {
    const cambios: UpdateQuery<DocFormulario> = { $set: { ...datos } };
    if (control.archivar) {
      // Versión nueva: las preguntas anteriores pasan al historial y la versión sube en 1.
      cambios.$set!.version = control.versionEsperada + 1;
      cambios.$push = {
        versiones: { version: control.versionEsperada, preguntas: control.archivar, reemplazadaEn: new Date() },
      };
    }

    // Todo en UNA operación sobre UN documento, que en MongoDB es atómica. El filtro por version
    // es la concurrencia optimista: si otra edición ya la cambió, no coincide y devuelve null.
    const documento = await ModeloFormulario.findOneAndUpdate({ _id: id, version: control.versionEsperada }, cambios, {
      returnDocument: 'after',
      runValidators: true,
      projection: SIN_HISTORIAL,
    }).lean<DocFormulario>();
    return documento ? aFormulario(documento) : null;
  }

  async obtenerVersiones(id: string): Promise<VersionFormulario[] | null> {
    const documento = await ModeloFormulario.findById(id, { version: 1, preguntas: 1, versiones: 1 }).lean<
      Pick<DocFormulario, 'version' | 'preguntas' | 'versiones'>
    >();
    if (!documento) return null;

    return [
      ...(documento.versiones ?? []).map((v) => ({
        version: v.version,
        preguntas: v.preguntas.map(aPregunta),
        reemplazadaEn: v.reemplazadaEn,
      })),
      { version: documento.version, preguntas: documento.preguntas.map(aPregunta), reemplazadaEn: null },
    ];
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
