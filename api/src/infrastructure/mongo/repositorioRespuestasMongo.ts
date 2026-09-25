import { Types, type PipelineStage } from 'mongoose';
import type {
  ConsultaEstadisticas,
  FiltroRespuestas,
  NuevaRespuesta,
  RepositorioRespuestas,
  RespuestaGuardada,
} from '../../application/puertos.js';
import type { AgregadosCrudos, ValorRespuesta } from '@formalista/compartido';
import { ModeloRespuesta, type DocRespuesta } from './modelos.js';

/** Cuántos textos recientes se devuelven por pregunta de texto (el resto se ve en el listado). */
const TEXTOS_RECIENTES = 5;

interface ClaveVersionPregunta {
  v: number;
  p: string;
}

/** Forma exacta de lo que devuelve el $facet (una fila por grupo). */
interface ResultadoFacet {
  total: { n: number }[];
  porVersion: { _id: number; cantidad: number }[];
  porDia: { _id: string; cantidad: number }[];
  respondidas: { _id: ClaveVersionPregunta; cantidad: number }[];
  conteos: { _id: ClaveVersionPregunta & { valor: string | number }; cantidad: number }[];
  escalas: { _id: ClaveVersionPregunta; suma: number; cantidad: number }[];
  fechas: { _id: ClaveVersionPregunta; primera: string; ultima: string }[];
  textos: { _id: string; ultimos: { valor: string; enviadaEn: Date }[] }[];
}

export class RepositorioRespuestasMongo implements RepositorioRespuestas {
  async crear(datos: NuevaRespuesta): Promise<RespuestaGuardada> {
    const documento = await ModeloRespuesta.create(datos);
    return { ...datos, id: documento._id.toString(), enviadaEn: documento.enviadaEn };
  }

  /**
   * Una sola agregación con $facet: varias sub-consultas sobre el MISMO conjunto de respuestas
   * filtradas, en un solo viaje a la base. Mongo devuelve grupos ya contados, no documentos.
   */
  async agregarEstadisticas(consulta: ConsultaEstadisticas): Promise<AgregadosCrudos> {
    // Ojo: aggregate() NO convierte tipos como find(); el id debe ir como ObjectId explícito.
    const match: Record<string, unknown> = { formularioId: new Types.ObjectId(consulta.formularioId) };
    if (consulta.version !== undefined) match.version = consulta.version;

    const clave = { v: '$version', p: '$respuestas.preguntaId' };
    const soloPreguntas = (ids: string[]): PipelineStage.FacetPipelineStage[] => [
      { $unwind: '$respuestas' },
      { $match: { 'respuestas.preguntaId': { $in: ids } } },
    ];

    const [resultado] = await ModeloRespuesta.aggregate<ResultadoFacet>([
      { $match: match },
      {
        $facet: {
          total: [{ $count: 'n' }],
          porVersion: [{ $group: { _id: '$version', cantidad: { $sum: 1 } } }],
          porDia: [
            {
              $group: {
                // Día LOCAL: una respuesta de las 23:30 en Chile es del día siguiente en UTC.
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$enviadaEn', timezone: consulta.zona } },
                cantidad: { $sum: 1 },
              },
            },
          ],
          respondidas: [{ $unwind: '$respuestas' }, { $group: { _id: clave, cantidad: { $sum: 1 } } }],
          conteos: [
            ...soloPreguntas(consulta.idsConteo),
            // Opción múltiple: un documento por opción elegida. Con un valor escalar (única, escala)
            // $unwind lo deja tal cual.
            { $unwind: '$respuestas.valor' },
            { $group: { _id: { ...clave, valor: '$respuestas.valor' }, cantidad: { $sum: 1 } } },
          ],
          escalas: [
            ...soloPreguntas(consulta.idsEscala),
            // Suma y cantidad (no $avg): el dominio combina versiones con un promedio ponderado.
            { $group: { _id: clave, suma: { $sum: '$respuestas.valor' }, cantidad: { $sum: 1 } } },
          ],
          fechas: [
            ...soloPreguntas(consulta.idsFecha),
            // "AAAA-MM-DD" se ordena igual como texto que como fecha: $min/$max funcionan directo.
            { $group: { _id: clave, primera: { $min: '$respuestas.valor' }, ultima: { $max: '$respuestas.valor' } } },
          ],
          textos: [
            ...soloPreguntas(consulta.idsTexto),
            {
              $group: {
                _id: '$respuestas.preguntaId',
                // $topN (MongoDB 5.2+): los N más recientes por grupo, sin traer todos los textos.
                ultimos: {
                  $topN: {
                    n: TEXTOS_RECIENTES,
                    sortBy: { enviadaEn: -1 },
                    output: { valor: '$respuestas.valor', enviadaEn: '$enviadaEn' },
                  },
                },
              },
            },
          ],
        },
      },
    ]);

    const r = resultado!;
    const porClave = ({ v, p }: ClaveVersionPregunta) => ({ version: v, preguntaId: p });
    return {
      total: r.total[0]?.n ?? 0,
      porVersion: r.porVersion.map((f) => ({ version: f._id, cantidad: f.cantidad })),
      porDia: r.porDia.map((f) => ({ dia: f._id, cantidad: f.cantidad })),
      respondidas: r.respondidas.map((f) => ({ ...porClave(f._id), cantidad: f.cantidad })),
      conteos: r.conteos.map((f) => ({ ...porClave(f._id), valor: f._id.valor, cantidad: f.cantidad })),
      escalas: r.escalas.map((f) => ({ ...porClave(f._id), suma: f.suma, cantidad: f.cantidad })),
      fechas: r.fechas.map((f) => ({ ...porClave(f._id), primera: f.primera, ultima: f.ultima })),
      textos: r.textos.map((f) => ({ preguntaId: f._id, ultimos: f.ultimos })),
    };
  }

  async listar(
    filtro: FiltroRespuestas,
    pagina: { saltar: number; limite: number },
  ): Promise<{ total: number; respuestas: RespuestaGuardada[] }> {
    const consulta = { formularioId: filtro.formularioId, ...(filtro.version !== undefined && { version: filtro.version }) };

    // _id como desempate: dos respuestas en el mismo milisegundo mantienen un orden estable entre páginas.
    const [total, documentos] = await Promise.all([
      ModeloRespuesta.countDocuments(consulta),
      ModeloRespuesta.find(consulta)
        .sort({ enviadaEn: -1, _id: -1 })
        .skip(pagina.saltar)
        .limit(pagina.limite)
        .lean<DocRespuesta[]>(),
    ]);

    return {
      total,
      respuestas: documentos.map((d) => ({
        id: d._id.toString(),
        formularioId: d.formularioId.toString(),
        version: d.version,
        respuestas: d.respuestas.map((x) => ({ preguntaId: x.preguntaId, valor: x.valor as ValorRespuesta })),
        enviadaEn: d.enviadaEn,
      })),
    };
  }

  async eliminarPorFormulario(formularioId: string): Promise<number> {
    const resultado = await ModeloRespuesta.deleteMany({ formularioId });
    return resultado.deletedCount;
  }

  async listarIdsDeFormularios(): Promise<string[]> {
    const ids = await ModeloRespuesta.distinct('formularioId');
    return ids.map(String);
  }
}
