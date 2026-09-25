// Contratos de RESPUESTA de la API: lo que cada endpoint devuelve. La API los produce y la web
// los consume como Serializado<T> (las fechas llegan como texto). Si la API cambia un campo,
// la web deja de compilar en vez de fallar en tiempo de ejecución.
import type { EstadoFormulario, Formulario, Pregunta, TipoPregunta } from './dominio/formulario.js';
import type { RolEquipo, RolFormulario } from './dominio/permisos.js';
import type { ValorRespuesta } from './dominio/respuesta.js';

// ---- Formularios (GET/POST/PUT /api/formularios…) ----

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

/** Un elemento de GET /api/formularios. */
export interface ResumenFormulario {
  id: string;
  titulo: string;
  /** Para armar el link público /f/:slug. */
  slug: string;
  estado: EstadoFormulario;
  rol: RolFormulario;
  equipo: EquipoCompartido | null;
  cantidadPreguntas: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

// ---- Respuestas de un formulario (GET /api/formularios/:id/respuestas) ----

export interface RespuestaListada {
  id: string;
  enviadaEn: Date;
  version: number;
  /** Cada valor con el texto y el tipo de la pregunta EN SU VERSIÓN. */
  respuestas: { preguntaId: string; pregunta: string | null; tipo: TipoPregunta | null; valor: ValorRespuesta }[];
}

export interface PaginaRespuestas {
  pagina: number;
  tamano: number;
  total: number;
  totalPaginas: number;
  respuestas: RespuestaListada[];
}

// ---- Público (GET/POST /api/publico/:slug…) ----

/** Lo que ve quien responde: sin ids internos, propietario ni fechas de edición. */
export interface FormularioPublico {
  slug: string;
  titulo: string;
  descripcion: string;
  version: number;
  preguntas: Pregunta[];
}

export interface ConfirmacionRespuesta {
  id: string;
  enviadaEn: Date;
}

// ---- Equipos (/api/equipos…) ----

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

export interface DetalleEquipo extends Equipo {
  /** Rol del usuario que consulta. */
  rol: RolEquipo;
  miembros: Miembro[];
}
