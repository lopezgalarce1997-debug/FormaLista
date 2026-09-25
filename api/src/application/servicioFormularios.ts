import { randomBytes, randomUUID } from 'node:crypto';
import {
  crearSlug,
  decidirEdicion,
  TRANSICIONES,
  validarCambioDeTipos,
  validarDefinicion,
  validarTransicion,
  type AccionEstado,
  type EstadoFormulario,
  type Formulario,
  type Pregunta,
} from '../domain/formulario.js';
import { formularioNoEncontrado, registroAccesible } from './acceso.js';
import { ErrorAplicacion } from './errores.js';
import type {
  ContenidoFormulario,
  Logger,
  RegistroFormulario,
  RepositorioFormularios,
  RepositorioRegistroFormularios,
  RepositorioRespuestas,
} from './puertos.js';

/** Una pregunta tal como llega del cliente: el id es opcional (si falta, se genera). */
type SinIdObligatorio<T> = T extends unknown ? Omit<T, 'id'> & { id?: string } : never;
export type PreguntaEntrada = SinIdObligatorio<Pregunta>;

export interface DatosFormulario {
  titulo: string;
  descripcion: string;
  preguntas: PreguntaEntrada[];
}

export interface DatosActualizacion extends DatosFormulario {
  /** Versión que el cliente estaba editando: si ya no es la vigente, se rechaza (409). */
  version: number;
}

export type FormularioConEstado = Formulario & { estado: EstadoFormulario };

export interface ResumenFormulario {
  id: string;
  titulo: string;
  estado: EstadoFormulario;
  cantidadPreguntas: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

/**
 * Consistencia entre bases: un formulario EXISTE solo si tiene fila en MySQL (formularios_registro).
 * - Crear: primero Mongo y al final MySQL; si MySQL falla, se compensa borrando el documento de Mongo.
 * - Eliminar: primero MySQL (desaparece para todos) y después Mongo; si Mongo falla, queda un
 *   huérfano invisible que se registra en el log y que después borra ServicioLimpieza.
 */
export class ServicioFormularios {
  constructor(
    private readonly registro: RepositorioRegistroFormularios,
    private readonly formularios: RepositorioFormularios,
    private readonly respuestas: RepositorioRespuestas,
    private readonly logger: Logger,
    private readonly generarSufijoSlug: () => string = sufijoAleatorio,
  ) {}

  async crear(usuarioId: number, datos: DatosFormulario): Promise<FormularioConEstado> {
    const contenido = prepararContenido(datos);
    const formulario = await this.formularios.crear({
      ...contenido,
      slug: crearSlug(datos.titulo, this.generarSufijoSlug()),
    });

    try {
      await this.registro.crear({ idMongo: formulario.id, propietarioId: usuarioId });
    } catch (error) {
      await this.compensarCreacion(formulario.id);
      throw error; // se propaga el error original, no el de la compensación
    }

    return { ...formulario, estado: 'borrador' };
  }

  async listar(usuarioId: number): Promise<ResumenFormulario[]> {
    const registros = await this.registro.listarPorPropietario(usuarioId);
    if (registros.length === 0) return [];

    // "JOIN" entre bases: MySQL decide qué formularios puede ver; Mongo aporta el contenido.
    const documentos = await this.formularios.buscarPorIds(registros.map((r) => r.idMongo));
    const porId = new Map(documentos.map((d) => [d.id, d]));

    return registros.flatMap((registro) => {
      const formulario = porId.get(registro.idMongo);
      if (!formulario) {
        this.logger.error('Formulario registrado en MySQL sin contenido en MongoDB', { formularioId: registro.idMongo });
        return [];
      }
      return [
        {
          id: formulario.id,
          titulo: formulario.titulo,
          estado: registro.estado,
          cantidadPreguntas: formulario.preguntas.length,
          creadoEn: formulario.creadoEn,
          actualizadoEn: formulario.actualizadoEn,
        },
      ];
    });
  }

  async obtener(usuarioId: number, id: string): Promise<FormularioConEstado> {
    const registro = await this.registroPropio(usuarioId, id);
    const formulario = await this.formularios.buscarPorId(id);
    return this.conEstado(formulario, registro);
  }

  /**
   * Edita con concurrencia optimista y versionado:
   * - Si el cliente editaba una versión que ya no es la vigente → 409 (evita pisar cambios ajenos).
   * - En un formulario ya publicado, cambiar preguntas crea una versión nueva y archiva la anterior,
   *   para que las respuestas antiguas se sigan interpretando con sus preguntas originales.
   */
  async actualizar(usuarioId: number, id: string, datos: DatosActualizacion): Promise<FormularioConEstado> {
    const registro = await this.registroPropio(usuarioId, id);
    const actual = this.conEstado(await this.formularios.buscarPorId(id), registro);
    if (datos.version !== actual.version) throw modificadoPorOtro();

    const contenido = prepararContenido(datos);
    if (registro.estado !== 'borrador') {
      const errores = validarCambioDeTipos(actual.preguntas, contenido.preguntas);
      if (errores.length > 0) throw new ErrorAplicacion('validacion', errores.join('. '));
    }

    const modo = decidirEdicion(registro.estado, actual.preguntas, contenido.preguntas);
    const actualizado = await this.formularios.actualizar(id, contenido, {
      versionEsperada: actual.version,
      archivar: modo === 'nueva_version' ? actual.preguntas : null,
    });
    // null: otra edición cambió la versión entre la lectura y la escritura.
    if (!actualizado) throw modificadoPorOtro();

    return { ...actualizado, estado: registro.estado };
  }

  async eliminar(usuarioId: number, id: string): Promise<void> {
    await this.registroPropio(usuarioId, id);
    await this.registro.eliminar(id);

    // Desde aquí el formulario ya no existe para nadie. Se borran contenido y respuestas por separado
    // (allSettled): si uno falla, el otro igual se intenta. Un fallo no se informa al cliente.
    const [respuestas, contenido] = await Promise.allSettled([
      this.respuestas.eliminarPorFormulario(id),
      this.formularios.eliminar(id),
    ]);
    if (respuestas.status === 'rejected') {
      this.logger.error('No se pudieron borrar las respuestas en MongoDB; quedaron huérfanas', {
        formularioId: id,
        error: respuestas.reason,
      });
    }
    if (contenido.status === 'rejected') {
      this.logger.error('No se pudo borrar el formulario en MongoDB; quedó huérfano', {
        formularioId: id,
        error: contenido.reason,
      });
    }
  }

  publicar(usuarioId: number, id: string): Promise<FormularioConEstado> {
    return this.cambiarEstado(usuarioId, id, 'publicar');
  }

  cerrar(usuarioId: number, id: string): Promise<FormularioConEstado> {
    return this.cambiarEstado(usuarioId, id, 'cerrar');
  }

  /** El estado vive solo en MySQL: publicar y cerrar tocan una sola base. */
  private async cambiarEstado(usuarioId: number, id: string, accion: AccionEstado): Promise<FormularioConEstado> {
    const registro = await this.registroPropio(usuarioId, id);
    const formulario = this.conEstado(await this.formularios.buscarPorId(id), registro);

    // Chequeo previo: da un mensaje claro al usuario.
    const invalida = validarTransicion(accion, registro.estado, formulario.preguntas.length);
    if (invalida) {
      throw new ErrorAplicacion(invalida.motivo === 'sin_preguntas' ? 'validacion' : 'conflicto', invalida.mensaje);
    }

    // Protección definitiva: UPDATE condicionado al estado actual. Si otra petición cambió el estado
    // entre la lectura y la escritura, no se aplica (evita, p. ej., cerrar dos veces a la vez).
    const { desde, hacia } = TRANSICIONES[accion];
    if (!(await this.registro.cambiarEstado(id, desde, hacia))) {
      throw new ErrorAplicacion('conflicto', 'El estado del formulario cambió; vuelve a intentarlo');
    }

    return { ...formulario, estado: hacia };
  }

  private async compensarCreacion(id: string): Promise<void> {
    try {
      await this.formularios.eliminar(id);
    } catch (errorCompensacion) {
      this.logger.error('Compensación fallida: formulario huérfano en MongoDB', {
        formularioId: id,
        error: errorCompensacion,
      });
    }
  }

  private registroPropio(usuarioId: number, id: string): Promise<RegistroFormulario> {
    return registroAccesible(this.registro, usuarioId, id);
  }

  private conEstado(formulario: Formulario | null, registro: RegistroFormulario): FormularioConEstado {
    if (!formulario) {
      this.logger.error('Formulario registrado en MySQL sin contenido en MongoDB', { formularioId: registro.idMongo });
      throw formularioNoEncontrado();
    }
    return { ...formulario, estado: registro.estado };
  }
}

function prepararContenido(datos: DatosFormulario): ContenidoFormulario {
  const preguntas = datos.preguntas.map((p) => ({ ...p, id: p.id ?? randomUUID() }) as Pregunta);
  const errores = validarDefinicion(preguntas);
  if (errores.length > 0) throw new ErrorAplicacion('validacion', errores.join('. '));
  return { titulo: datos.titulo, descripcion: datos.descripcion, preguntas };
}

function modificadoPorOtro(): ErrorAplicacion {
  return new ErrorAplicacion(
    'conflicto',
    'El formulario fue modificado por otra persona; recarga para ver la última versión',
  );
}

/** 8 caracteres en base 36 (~2,8 billones de combinaciones). El índice único de Mongo garantiza que no se repita. */
function sufijoAleatorio(): string {
  return BigInt(`0x${randomBytes(6).toString('hex')}`).toString(36).padStart(8, '0').slice(-8);
}
