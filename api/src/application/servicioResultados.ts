import {
  construirResultados,
  idsPorTipo,
  type Resultados,
  type SeleccionVersion,
} from '../domain/estadisticas.js';
import type { TipoPregunta, VersionFormulario } from '../domain/formulario.js';
import type { ValorRespuesta } from '../domain/respuesta.js';
import { autorizar, formularioNoEncontrado } from './acceso.js';
import { ErrorAplicacion } from './errores.js';
import type {
  Logger,
  RepositorioFormularios,
  RepositorioRegistroFormularios,
  RepositorioRespuestas,
} from './puertos.js';

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

/** Estadísticas y listado de respuestas de un formulario (cualquier rol con acceso: acción 'verResultados'). */
export class ServicioResultados {
  constructor(
    private readonly registro: RepositorioRegistroFormularios,
    private readonly formularios: RepositorioFormularios,
    private readonly respuestas: RepositorioRespuestas,
    private readonly logger: Logger,
  ) {}

  async obtenerResultados(
    usuarioId: number,
    id: string,
    consulta: { version: SeleccionVersion; zona: string },
  ): Promise<Resultados> {
    await autorizar(this.registro, usuarioId, id, 'verResultados');
    const versiones = this.filtrarVersiones(await this.versionesDe(id), consulta.version);

    const ids = idsPorTipo(versiones);
    const deTipo = (...tipos: TipoPregunta[]) => tipos.flatMap((t) => ids.get(t) ?? []);

    // Mongo cuenta (agregación); el dominio interpreta y combina versiones.
    const crudos = await this.respuestas.agregarEstadisticas({
      formularioId: id,
      version: consulta.version === 'todas' ? undefined : consulta.version,
      zona: consulta.zona,
      idsConteo: deTipo('opcion_unica', 'opcion_multiple', 'escala'),
      idsEscala: deTipo('escala'),
      idsFecha: deTipo('fecha'),
      idsTexto: deTipo('texto_corto', 'texto_largo'),
    });
    return construirResultados(versiones, crudos, consulta.version);
  }

  async listarRespuestas(
    usuarioId: number,
    id: string,
    consulta: { version: SeleccionVersion; pagina: number; tamano: number },
  ): Promise<PaginaRespuestas> {
    await autorizar(this.registro, usuarioId, id, 'verResultados');
    // El historial se lee una sola vez por página, no una vez por respuesta.
    const versiones = this.filtrarVersiones(await this.versionesDe(id), consulta.version);
    const preguntasPorVersion = new Map(versiones.map((v) => [v.version, new Map(v.preguntas.map((p) => [p.id, p]))]));

    const { total, respuestas } = await this.respuestas.listar(
      { formularioId: id, version: consulta.version === 'todas' ? undefined : consulta.version },
      { saltar: (consulta.pagina - 1) * consulta.tamano, limite: consulta.tamano },
    );

    return {
      pagina: consulta.pagina,
      tamano: consulta.tamano,
      total,
      totalPaginas: Math.ceil(total / consulta.tamano),
      respuestas: respuestas.map((r) => {
        const preguntas = preguntasPorVersion.get(r.version);
        return {
          id: r.id,
          enviadaEn: r.enviadaEn,
          version: r.version,
          respuestas: r.respuestas.map(({ preguntaId, valor }) => {
            const pregunta = preguntas?.get(preguntaId);
            return { preguntaId, pregunta: pregunta?.texto ?? null, tipo: pregunta?.tipo ?? null, valor };
          }),
        };
      }),
    };
  }

  private async versionesDe(id: string): Promise<VersionFormulario[]> {
    const versiones = await this.formularios.obtenerVersiones(id);
    if (!versiones) {
      this.logger.error('Formulario registrado en MySQL sin contenido en MongoDB', { formularioId: id });
      throw formularioNoEncontrado();
    }
    return versiones;
  }

  private filtrarVersiones(versiones: VersionFormulario[], seleccion: SeleccionVersion): VersionFormulario[] {
    if (seleccion === 'todas') return versiones;
    const elegida = versiones.filter((v) => v.version === seleccion);
    if (elegida.length === 0) {
      throw new ErrorAplicacion('validacion', 'La versión del formulario no existe', [
        { campo: 'version', mensaje: `No existe la versión ${seleccion}` },
      ]);
    }
    return elegida;
  }
}
