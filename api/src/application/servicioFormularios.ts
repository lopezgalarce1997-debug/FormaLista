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
import { rolEnFormulario, type AccionFormulario, type RolFormulario } from '../domain/permisos.js';
import { autorizar, formularioNoEncontrado, type AccesoAutorizado } from './acceso.js';
import { ErrorAplicacion } from './errores.js';
import type {
  AccesoFormulario,
  ContenidoFormulario,
  Logger,
  RepositorioEquipos,
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

export interface EquipoCompartido {
  id: number;
  nombre: string;
}

/** Lo que ve un usuario de un formulario: contenido + estado + SU rol (el frontend decide qué botones mostrar). */
export type FormularioDetalle = Formulario & {
  estado: EstadoFormulario;
  rol: RolFormulario;
  equipo: EquipoCompartido | null;
};

export interface ResumenFormulario {
  id: string;
  titulo: string;
  estado: EstadoFormulario;
  rol: RolFormulario;
  equipo: EquipoCompartido | null;
  cantidadPreguntas: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

/**
 * Consistencia entre bases: un formulario EXISTE solo si tiene fila en MySQL (formularios_registro).
 * - Crear: primero Mongo y al final MySQL; si MySQL falla, se compensa borrando el documento de Mongo.
 * - Eliminar: primero MySQL (desaparece para todos) y después Mongo; si Mongo falla, queda un
 *   huérfano invisible que se registra en el log y que después borra ServicioLimpieza.
 * Permisos: cada operación declara su acción y `autorizar` responde 404 (sin acceso) o 403 (rol insuficiente).
 */
export class ServicioFormularios {
  constructor(
    private readonly registro: RepositorioRegistroFormularios,
    private readonly formularios: RepositorioFormularios,
    private readonly respuestas: RepositorioRespuestas,
    private readonly equipos: RepositorioEquipos,
    private readonly logger: Logger,
    private readonly generarSufijoSlug: () => string = sufijoAleatorio,
  ) {}

  async crear(usuarioId: number, datos: DatosFormulario): Promise<FormularioDetalle> {
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

    return { ...formulario, estado: 'borrador', rol: 'propietario', equipo: null };
  }

  /** Los propios y los compartidos con los equipos del usuario. */
  async listar(usuarioId: number): Promise<ResumenFormulario[]> {
    const accesibles = await this.registro.listarAccesibles(usuarioId);
    if (accesibles.length === 0) return [];

    // "JOIN" entre bases: MySQL decide qué formularios puede ver; Mongo aporta el contenido.
    const documentos = await this.formularios.buscarPorIds(accesibles.map((a) => a.registro.idMongo));
    const porId = new Map(documentos.map((d) => [d.id, d]));

    return accesibles.flatMap((acceso) => {
      const formulario = porId.get(acceso.registro.idMongo);
      // La consulta ya filtró por acceso, así que rol no debería ser null; si lo fuera, no se muestra.
      const rol = rolEnFormulario(acceso.esPropietario, acceso.rolEquipo);
      if (!rol) return [];
      if (!formulario) {
        this.logger.error('Formulario registrado en MySQL sin contenido en MongoDB', {
          formularioId: acceso.registro.idMongo,
        });
        return [];
      }
      return [
        {
          id: formulario.id,
          titulo: formulario.titulo,
          estado: acceso.registro.estado,
          rol,
          equipo: equipoDe(acceso),
          cantidadPreguntas: formulario.preguntas.length,
          creadoEn: formulario.creadoEn,
          actualizadoEn: formulario.actualizadoEn,
        },
      ];
    });
  }

  async obtener(usuarioId: number, id: string): Promise<FormularioDetalle> {
    const acceso = await this.autorizar(usuarioId, id, 'ver');
    return this.detalle(await this.formularios.buscarPorId(id), acceso);
  }

  /**
   * Edita con concurrencia optimista y versionado:
   * - Si el cliente editaba una versión que ya no es la vigente → 409 (evita pisar cambios ajenos).
   * - En un formulario ya publicado, cambiar preguntas crea una versión nueva y archiva la anterior,
   *   para que las respuestas antiguas se sigan interpretando con sus preguntas originales.
   */
  async actualizar(usuarioId: number, id: string, datos: DatosActualizacion): Promise<FormularioDetalle> {
    const acceso = await this.autorizar(usuarioId, id, 'editar');
    const { estado } = acceso.registro;
    const actual = this.detalle(await this.formularios.buscarPorId(id), acceso);
    if (datos.version !== actual.version) throw modificadoPorOtro();

    const contenido = prepararContenido(datos);
    if (estado !== 'borrador') {
      const errores = validarCambioDeTipos(actual.preguntas, contenido.preguntas);
      if (errores.length > 0) throw new ErrorAplicacion('validacion', errores.join('. '));
    }

    const modo = decidirEdicion(estado, actual.preguntas, contenido.preguntas);
    const actualizado = await this.formularios.actualizar(id, contenido, {
      versionEsperada: actual.version,
      archivar: modo === 'nueva_version' ? actual.preguntas : null,
    });
    // null: otra edición cambió la versión entre la lectura y la escritura.
    if (!actualizado) throw modificadoPorOtro();

    return this.detalle(actualizado, acceso);
  }

  async eliminar(usuarioId: number, id: string): Promise<void> {
    await this.autorizar(usuarioId, id, 'eliminar');
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

  publicar(usuarioId: number, id: string): Promise<FormularioDetalle> {
    return this.cambiarEstado(usuarioId, id, 'publicar');
  }

  cerrar(usuarioId: number, id: string): Promise<FormularioDetalle> {
    return this.cambiarEstado(usuarioId, id, 'cerrar');
  }

  /**
   * Comparte el formulario con un equipo (o deja de compartir con null). Solo su propietario.
   * Solo se puede compartir con equipos de los que se es miembro; un equipo ajeno responde 404,
   * igual que un formulario ajeno: no se revela que existe.
   */
  async compartir(usuarioId: number, id: string, equipoId: number | null): Promise<FormularioDetalle> {
    await this.autorizar(usuarioId, id, 'compartir');
    if (equipoId !== null && !(await this.equipos.rolDe(equipoId, usuarioId))) {
      throw new ErrorAplicacion('no_encontrado', 'Equipo no encontrado');
    }
    await this.registro.asignarEquipo(id, equipoId);
    return this.obtener(usuarioId, id);
  }

  /** El estado vive solo en MySQL: publicar y cerrar tocan una sola base. */
  private async cambiarEstado(usuarioId: number, id: string, accion: AccionEstado): Promise<FormularioDetalle> {
    const acceso = await this.autorizar(usuarioId, id, 'cambiarEstado');
    const formulario = this.detalle(await this.formularios.buscarPorId(id), acceso);

    // Chequeo previo: da un mensaje claro al usuario.
    const invalida = validarTransicion(accion, acceso.registro.estado, formulario.preguntas.length);
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

  private autorizar(usuarioId: number, id: string, accion: AccionFormulario): Promise<AccesoAutorizado> {
    return autorizar(this.registro, usuarioId, id, accion);
  }

  private detalle(formulario: Formulario | null, acceso: AccesoAutorizado): FormularioDetalle {
    if (!formulario) {
      this.logger.error('Formulario registrado en MySQL sin contenido en MongoDB', {
        formularioId: acceso.registro.idMongo,
      });
      throw formularioNoEncontrado();
    }
    return { ...formulario, estado: acceso.registro.estado, rol: acceso.rol, equipo: equipoDe(acceso) };
  }
}

function equipoDe(acceso: AccesoFormulario): EquipoCompartido | null {
  const { equipoId } = acceso.registro;
  return equipoId !== null && acceso.equipoNombre !== null ? { id: equipoId, nombre: acceso.equipoNombre } : null;
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
