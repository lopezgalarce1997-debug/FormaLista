// Interfaces que la capa de aplicación necesita y que infrastructure implementa
// (como las interfaces IRepository de la capa Application en Clean Architecture .NET).
import type { EstadoFormulario, Formulario, Pregunta } from '../domain/formulario.js';
import type { RespuestaValidada } from '../domain/respuesta.js';
import type { Usuario } from '../domain/usuario.js';

export interface NuevoUsuario {
  nombre: string;
  email: string;
  passwordHash: string;
}

export interface RepositorioUsuarios {
  buscarPorId(id: number): Promise<Usuario | null>;
  buscarPorEmail(email: string): Promise<Usuario | null>;
  /** Lanza ErrorAplicacion('conflicto') si el email ya existe. */
  crear(datos: NuevoUsuario): Promise<Usuario>;
}

export interface Hasheador {
  hashear(texto: string): Promise<string>;
  comparar(texto: string, hash: string): Promise<boolean>;
}

export interface ServicioTokens {
  firmar(usuarioId: number): Promise<string>;
  /** Devuelve el id del usuario o lanza ErrorAplicacion('no_autorizado'). */
  verificar(token: string): Promise<number>;
}

// ---- Formularios: metadatos y permisos en MySQL ----

export interface RegistroFormulario {
  idMongo: string;
  propietarioId: number;
  equipoId: number | null;
  estado: EstadoFormulario;
  creadoEn: Date;
}

export interface RepositorioRegistroFormularios {
  crear(datos: { idMongo: string; propietarioId: number }): Promise<void>;
  buscar(idMongo: string): Promise<RegistroFormulario | null>;
  listarPorPropietario(usuarioId: number): Promise<RegistroFormulario[]>;
  eliminar(idMongo: string): Promise<void>;
  /**
   * Cambia el estado solo si el actual está en `desde`, en una sola operación atómica
   * (UPDATE ... WHERE estado IN (...)). Devuelve false si no se cambió.
   */
  cambiarEstado(idMongo: string, desde: EstadoFormulario[], hacia: EstadoFormulario): Promise<boolean>;
  /** De los ids recibidos, devuelve los que sí tienen registro. */
  filtrarExistentes(idsMongo: string[]): Promise<Set<string>>;
}

// ---- Formularios y respuestas: contenido en MongoDB ----

export interface ContenidoFormulario {
  titulo: string;
  descripcion: string;
  preguntas: Pregunta[];
}

export interface RepositorioFormularios {
  crear(datos: ContenidoFormulario & { slug: string }): Promise<Formulario>;
  buscarPorId(id: string): Promise<Formulario | null>;
  buscarPorSlug(slug: string): Promise<Formulario | null>;
  buscarPorIds(ids: string[]): Promise<Formulario[]>;
  /** Devuelve null si el documento no existe. */
  actualizar(id: string, datos: ContenidoFormulario): Promise<Formulario | null>;
  eliminar(id: string): Promise<void>;
  listarIdsCreadosAntesDe(fecha: Date): Promise<string[]>;
}

export interface NuevaRespuesta {
  formularioId: string;
  /** Versión del formulario con la que se respondió (clave para el versionado del paso 8). */
  version: number;
  respuestas: RespuestaValidada[];
}

export interface RespuestaGuardada extends NuevaRespuesta {
  id: string;
  enviadaEn: Date;
}

export interface RepositorioRespuestas {
  crear(datos: NuevaRespuesta): Promise<RespuestaGuardada>;
  /** Devuelve cuántas respuestas se eliminaron. */
  eliminarPorFormulario(formularioId: string): Promise<number>;
  /** Ids (distintos) de los formularios que tienen al menos una respuesta. */
  listarIdsDeFormularios(): Promise<string[]>;
}

export interface Logger {
  error(mensaje: string, contexto?: Record<string, unknown>): void;
}
