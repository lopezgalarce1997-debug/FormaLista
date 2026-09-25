import type {
  AccesoFormulario,
  ConsultaEstadisticas,
  ContenidoFormulario,
  ControlEdicion,
  FiltroRespuestas,
  NuevaRespuesta,
  RegistroFormulario,
  RepositorioFormularios,
  RepositorioRegistroFormularios,
  RepositorioRespuestas,
  RespuestaGuardada,
} from '../../src/application/puertos.js';
import type { AgregadosCrudos, EstadoFormulario, Formulario, VersionFormulario } from '@formalista/compartido';
import type { EquiposEnMemoria } from './equiposEnMemoria.js';

/** Permite simular que una base de datos falla en un método concreto: `repo.fallarEn('crear')`. */
class ConFallasSimuladas<M extends string> {
  private readonly fallas = new Set<M>();

  fallarEn(...metodos: M[]): this {
    metodos.forEach((m) => this.fallas.add(m));
    return this;
  }

  protected revisarFalla(metodo: M): void {
    if (this.fallas.has(metodo)) throw new Error(`Falla simulada en ${this.constructor.name}.${metodo}`);
  }
}

/**
 * Doble de MySQL (formularios_registro). Imita el JOIN con equipo_miembros consultando el doble
 * de equipos (si se le pasa uno).
 */
export class RegistroEnMemoria
  extends ConFallasSimuladas<keyof RepositorioRegistroFormularios>
  implements RepositorioRegistroFormularios
{
  readonly filas = new Map<string, RegistroFormulario>();

  constructor(private readonly equipos?: EquiposEnMemoria) {
    super();
  }

  async crear(datos: { idMongo: string; propietarioId: number }): Promise<void> {
    this.revisarFalla('crear');
    this.filas.set(datos.idMongo, { ...datos, equipoId: null, estado: 'borrador', creadoEn: new Date() });
  }

  async buscar(idMongo: string): Promise<RegistroFormulario | null> {
    this.revisarFalla('buscar');
    return this.filas.get(idMongo) ?? null;
  }

  async buscarAcceso(idMongo: string, usuarioId: number): Promise<AccesoFormulario | null> {
    this.revisarFalla('buscarAcceso');
    const registro = this.filas.get(idMongo);
    return registro ? this.accesoDe(registro, usuarioId) : null;
  }

  async listarAccesibles(usuarioId: number): Promise<AccesoFormulario[]> {
    this.revisarFalla('listarAccesibles');
    const accesos = await Promise.all([...this.filas.values()].map((r) => this.accesoDe(r, usuarioId)));
    return accesos.filter((a) => a.esPropietario || a.rolEquipo !== null).reverse();
  }

  async asignarEquipo(idMongo: string, equipoId: number | null): Promise<void> {
    this.revisarFalla('asignarEquipo');
    const fila = this.filas.get(idMongo);
    if (fila) fila.equipoId = equipoId;
  }

  private async accesoDe(registro: RegistroFormulario, usuarioId: number): Promise<AccesoFormulario> {
    const { equipoId } = registro;
    return {
      registro: { ...registro },
      esPropietario: registro.propietarioId === usuarioId,
      rolEquipo: equipoId !== null ? ((await this.equipos?.rolDe(equipoId, usuarioId)) ?? null) : null,
      equipoNombre: equipoId !== null ? ((await this.equipos?.buscar(equipoId))?.nombre ?? null) : null,
    };
  }

  async eliminar(idMongo: string): Promise<void> {
    this.revisarFalla('eliminar');
    this.filas.delete(idMongo);
  }

  async cambiarEstado(idMongo: string, desde: EstadoFormulario[], hacia: EstadoFormulario): Promise<boolean> {
    this.revisarFalla('cambiarEstado');
    const fila = this.filas.get(idMongo);
    if (!fila || !desde.includes(fila.estado)) return false;
    fila.estado = hacia;
    return true;
  }

  async filtrarExistentes(idsMongo: string[]): Promise<Set<string>> {
    this.revisarFalla('filtrarExistentes');
    return new Set(idsMongo.filter((id) => this.filas.has(id)));
  }
}

/** Doble de MongoDB (colección formularios). */
export class FormulariosEnMemoria
  extends ConFallasSimuladas<keyof RepositorioFormularios>
  implements RepositorioFormularios
{
  readonly documentos = new Map<string, Formulario>();
  /** Versiones anteriores de cada formulario (el campo `versiones` del documento en Mongo). */
  readonly historial = new Map<string, VersionFormulario[]>();
  private siguienteId = 1;

  async crear(datos: ContenidoFormulario & { slug: string }, creadoEn = new Date()): Promise<Formulario> {
    this.revisarFalla('crear');
    const id = (this.siguienteId++).toString(16).padStart(24, '0'); // mismo formato que un ObjectId
    const formulario: Formulario = { id, ...datos, version: 1, creadoEn, actualizadoEn: creadoEn };
    this.documentos.set(id, formulario);
    return formulario;
  }

  async buscarPorId(id: string): Promise<Formulario | null> {
    this.revisarFalla('buscarPorId');
    return this.documentos.get(id) ?? null;
  }

  async buscarPorSlug(slug: string): Promise<Formulario | null> {
    this.revisarFalla('buscarPorSlug');
    return [...this.documentos.values()].find((f) => f.slug === slug) ?? null;
  }

  async buscarPorIds(ids: string[]): Promise<Formulario[]> {
    this.revisarFalla('buscarPorIds');
    return ids.flatMap((id) => this.documentos.get(id) ?? []);
  }

  async actualizar(id: string, datos: ContenidoFormulario, control: ControlEdicion): Promise<Formulario | null> {
    this.revisarFalla('actualizar');
    const actual = this.documentos.get(id);
    // Igual que el filtro { _id, version } de Mongo: si la versión no coincide, no actualiza.
    if (!actual || actual.version !== control.versionEsperada) return null;

    let version = actual.version;
    if (control.archivar) {
      const historial = this.historial.get(id) ?? [];
      historial.push({ version: actual.version, preguntas: control.archivar, reemplazadaEn: new Date() });
      this.historial.set(id, historial);
      version++;
    }
    const actualizado = { ...actual, ...datos, version, actualizadoEn: new Date() };
    this.documentos.set(id, actualizado);
    return actualizado;
  }

  async obtenerVersiones(id: string): Promise<VersionFormulario[] | null> {
    this.revisarFalla('obtenerVersiones');
    const actual = this.documentos.get(id);
    if (!actual) return null;
    return [
      ...(this.historial.get(id) ?? []),
      { version: actual.version, preguntas: actual.preguntas, reemplazadaEn: null },
    ];
  }

  async eliminar(id: string): Promise<void> {
    this.revisarFalla('eliminar');
    this.documentos.delete(id);
  }

  async listarIdsCreadosAntesDe(fecha: Date): Promise<string[]> {
    this.revisarFalla('listarIdsCreadosAntesDe');
    return [...this.documentos.values()].filter((f) => f.creadoEn < fecha).map((f) => f.id);
  }
}

/** Doble de MongoDB (colección respuestas). */
export class RespuestasEnMemoria
  extends ConFallasSimuladas<keyof RepositorioRespuestas>
  implements RepositorioRespuestas
{
  guardadas: RespuestaGuardada[] = [];
  private siguienteId = 1;

  /** Atajo para pruebas: agrega `cantidad` respuestas vacías a un formulario. */
  agregar(formularioId: string, cantidad = 1): void {
    for (let i = 0; i < cantidad; i++) {
      this.guardadas.push({ id: `r${this.siguienteId++}`, formularioId, version: 1, respuestas: [], enviadaEn: new Date() });
    }
  }

  contarDe(formularioId: string): number {
    return this.guardadas.filter((r) => r.formularioId === formularioId).length;
  }

  async crear(datos: NuevaRespuesta): Promise<RespuestaGuardada> {
    this.revisarFalla('crear');
    const guardada = { ...datos, id: `r${this.siguienteId++}`, enviadaEn: new Date() };
    this.guardadas.push(guardada);
    return guardada;
  }

  /**
   * La agregación real se prueba contra MongoDB (test/integracion). Aquí se devuelven agregados
   * preparados por cada prueba y se guarda la consulta recibida para verificarla.
   */
  crudosSimulados: AgregadosCrudos = {
    total: 0,
    porVersion: [],
    porDia: [],
    respondidas: [],
    conteos: [],
    escalas: [],
    fechas: [],
    textos: [],
  };
  ultimaConsulta: ConsultaEstadisticas | null = null;

  async agregarEstadisticas(consulta: ConsultaEstadisticas): Promise<AgregadosCrudos> {
    this.revisarFalla('agregarEstadisticas');
    this.ultimaConsulta = consulta;
    return this.crudosSimulados;
  }

  async listar(
    filtro: FiltroRespuestas,
    pagina: { saltar: number; limite: number },
  ): Promise<{ total: number; respuestas: RespuestaGuardada[] }> {
    this.revisarFalla('listar');
    const filtradas = this.guardadas
      .filter((r) => r.formularioId === filtro.formularioId && (filtro.version === undefined || r.version === filtro.version))
      .sort((a, b) => b.enviadaEn.getTime() - a.enviadaEn.getTime() || b.id.localeCompare(a.id));
    return { total: filtradas.length, respuestas: filtradas.slice(pagina.saltar, pagina.saltar + pagina.limite) };
  }

  async eliminarPorFormulario(formularioId: string): Promise<number> {
    this.revisarFalla('eliminarPorFormulario');
    const antes = this.guardadas.length;
    this.guardadas = this.guardadas.filter((r) => r.formularioId !== formularioId);
    return antes - this.guardadas.length;
  }

  async listarIdsDeFormularios(): Promise<string[]> {
    this.revisarFalla('listarIdsDeFormularios');
    return [...new Set(this.guardadas.map((r) => r.formularioId))];
  }
}
