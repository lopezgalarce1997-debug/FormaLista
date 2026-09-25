import type { NuevaRespuesta, RepositorioRespuestas, RespuestaGuardada } from '../../application/puertos.js';
import { ModeloRespuesta } from './modelos.js';

export class RepositorioRespuestasMongo implements RepositorioRespuestas {
  async crear(datos: NuevaRespuesta): Promise<RespuestaGuardada> {
    const documento = await ModeloRespuesta.create(datos);
    return { ...datos, id: documento._id.toString(), enviadaEn: documento.enviadaEn };
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
