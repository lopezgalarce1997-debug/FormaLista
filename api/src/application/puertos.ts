// Interfaces que la capa de aplicación necesita y que infrastructure implementa
// (como las interfaces IRepository de la capa Application en Clean Architecture .NET).
import type { AgregadosCrudos } from '../domain/estadisticas.js';
import type { EstadoFormulario, Formulario, Pregunta, VersionFormulario } from '../domain/formulario.js';
import type { MiembroActual, RolEquipo } from '../domain/permisos.js';
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

/** El registro de un formulario visto por un usuario: datos crudos del JOIN, sin interpretar. */
export interface AccesoFormulario {
  registro: RegistroFormulario;
  esPropietario: boolean;
  /** Rol del usuario en el equipo con el que está compartido el formulario (null si no es miembro). */
  rolEquipo: RolEquipo | null;
  equipoNombre: string | null;
}

export interface RepositorioRegistroFormularios {
  crear(datos: { idMongo: string; propietarioId: number }): Promise<void>;
  buscar(idMongo: string): Promise<RegistroFormulario | null>;
  /** El formulario y la relación del usuario con él (propietario / miembro del equipo), o null si no existe. */
  buscarAcceso(idMongo: string, usuarioId: number): Promise<AccesoFormulario | null>;
  /** Formularios propios y compartidos con los equipos del usuario, más recientes primero. */
  listarAccesibles(usuarioId: number): Promise<AccesoFormulario[]>;
  /** Comparte con un equipo o deja de compartir (null). */
  asignarEquipo(idMongo: string, equipoId: number | null): Promise<void>;
  eliminar(idMongo: string): Promise<void>;
  /**
   * Cambia el estado solo si el actual está en `desde`, en una sola operación atómica
   * (UPDATE ... WHERE estado IN (...)). Devuelve false si no se cambió.
   */
  cambiarEstado(idMongo: string, desde: EstadoFormulario[], hacia: EstadoFormulario): Promise<boolean>;
  /** De los ids recibidos, devuelve los que sí tienen registro. */
  filtrarExistentes(idsMongo: string[]): Promise<Set<string>>;
}

// ---- Equipos (MySQL) ----

export interface Equipo {
  id: number;
  nombre: string;
  creadoEn: Date;
}

export interface EquipoDeUsuario extends Equipo {
  rol: RolEquipo;
  cantidadMiembros: number;
}

export interface Miembro {
  usuarioId: number;
  nombre: string;
  email: string;
  rol: RolEquipo;
}

export interface RepositorioEquipos {
  /** Crea el equipo y agrega al creador como propietario, en una transacción. */
  crearConPropietario(nombre: string, usuarioId: number): Promise<Equipo>;
  listarDeUsuario(usuarioId: number): Promise<EquipoDeUsuario[]>;
  buscar(equipoId: number): Promise<Equipo | null>;
  listarMiembros(equipoId: number): Promise<Miembro[]>;
  rolDe(equipoId: number, usuarioId: number): Promise<RolEquipo | null>;
  /** Lanza ErrorAplicacion('conflicto') si ya es miembro. */
  agregarMiembro(equipoId: number, usuarioId: number, rol: RolEquipo): Promise<void>;
  /**
   * Cambia el rol de un miembro o lo quita (nuevoRol = null) dentro de una transacción que BLOQUEA
   * los miembros del equipo (SELECT ... FOR UPDATE). `validar` recibe los miembros actuales y puede
   * lanzar un error para cancelar: así la regla de negocio se evalúa sin carreras.
   */
  modificarMiembro(
    equipoId: number,
    usuarioId: number,
    nuevoRol: RolEquipo | null,
    validar: (miembros: MiembroActual[]) => void,
  ): Promise<void>;
}

// ---- Formularios y respuestas: contenido en MongoDB ----

export interface ContenidoFormulario {
  titulo: string;
  descripcion: string;
  preguntas: Pregunta[];
}

export interface ControlEdicion {
  /** Solo se actualiza si la versión guardada sigue siendo esta (concurrencia optimista). */
  versionEsperada: number;
  /** Si viene, se guardan estas preguntas en el historial como versionEsperada y la versión sube en 1. */
  archivar: Pregunta[] | null;
}

/** Las lecturas NO incluyen el historial de versiones; para eso está obtenerVersiones. */
export interface RepositorioFormularios {
  crear(datos: ContenidoFormulario & { slug: string }): Promise<Formulario>;
  buscarPorId(id: string): Promise<Formulario | null>;
  buscarPorSlug(slug: string): Promise<Formulario | null>;
  buscarPorIds(ids: string[]): Promise<Formulario[]>;
  /** Devuelve null si el documento no existe o si su versión ya no es la esperada. */
  actualizar(id: string, datos: ContenidoFormulario, control: ControlEdicion): Promise<Formulario | null>;
  /** Todas las versiones (las del historial y la vigente), o null si el formulario no existe. */
  obtenerVersiones(id: string): Promise<VersionFormulario[] | null>;
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

export interface FiltroRespuestas {
  formularioId: string;
  /** Sin versión = todas. */
  version?: number;
}

export interface ConsultaEstadisticas extends FiltroRespuestas {
  /** Zona horaria IANA para agrupar por día (p. ej. America/Santiago). */
  zona: string;
  /** Ids de pregunta por tipo: las respuestas no guardan el tipo, lo aporta la definición. */
  /** Preguntas cuyas respuestas se cuentan por valor: opciones (única y múltiple) y escalas. */
  idsConteo: string[];
  idsEscala: string[];
  idsFecha: string[];
  idsTexto: string[];
}

export interface RepositorioRespuestas {
  crear(datos: NuevaRespuesta): Promise<RespuestaGuardada>;
  agregarEstadisticas(consulta: ConsultaEstadisticas): Promise<AgregadosCrudos>;
  /** Más recientes primero. */
  listar(filtro: FiltroRespuestas, pagina: { saltar: number; limite: number }): Promise<{
    total: number;
    respuestas: RespuestaGuardada[];
  }>;
  /** Devuelve cuántas respuestas se eliminaron. */
  eliminarPorFormulario(formularioId: string): Promise<number>;
  /** Ids (distintos) de los formularios que tienen al menos una respuesta. */
  listarIdsDeFormularios(): Promise<string[]>;
}

export interface Logger {
  error(mensaje: string, contexto?: Record<string, unknown>): void;
}
