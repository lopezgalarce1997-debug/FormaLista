import type {
  ContenidoFormulario,
  NuevaRespuesta,
  RegistroFormulario,
  RepositorioFormularios,
  RepositorioRegistroFormularios,
  RepositorioRespuestas,
  RespuestaGuardada,
} from '../../src/application/puertos.js';
import type { EstadoFormulario, Formulario } from '../../src/domain/formulario.js';

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

/** Doble de MySQL (formularios_registro). */
export class RegistroEnMemoria
  extends ConFallasSimuladas<keyof RepositorioRegistroFormularios>
  implements RepositorioRegistroFormularios
{
  readonly filas = new Map<string, RegistroFormulario>();

  async crear(datos: { idMongo: string; propietarioId: number }): Promise<void> {
    this.revisarFalla('crear');
    this.filas.set(datos.idMongo, { ...datos, equipoId: null, estado: 'borrador', creadoEn: new Date() });
  }

  async buscar(idMongo: string): Promise<RegistroFormulario | null> {
    this.revisarFalla('buscar');
    return this.filas.get(idMongo) ?? null;
  }

  async listarPorPropietario(usuarioId: number): Promise<RegistroFormulario[]> {
    this.revisarFalla('listarPorPropietario');
    return [...this.filas.values()].filter((f) => f.propietarioId === usuarioId).reverse();
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

  async actualizar(id: string, datos: ContenidoFormulario): Promise<Formulario | null> {
    this.revisarFalla('actualizar');
    const actual = this.documentos.get(id);
    if (!actual) return null;
    const actualizado = { ...actual, ...datos, actualizadoEn: new Date() };
    this.documentos.set(id, actualizado);
    return actualizado;
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
