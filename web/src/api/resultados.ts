import type { PaginaRespuestas, Resultados, SeleccionVersion, Serializado } from '@formalista/compartido';
import { pedir } from './cliente';

export type ResultadosDeFormulario = Serializado<Resultados>;
export type Estadistica = ResultadosDeFormulario['preguntas'][number];
export type PaginaDeRespuestas = Serializado<PaginaRespuestas>;

export const clavesResultados = {
  /** Prefijo común: invalidarlo actualiza estadísticas y respuestas de un formulario. */
  todo: (id: string) => ['resultados', id] as const,
  estadisticas: (id: string, version: SeleccionVersion, zona: string) => ['resultados', id, 'estadisticas', version, zona] as const,
  respuestas: (id: string, version: SeleccionVersion, pagina: number) => ['resultados', id, 'respuestas', version, pagina] as const,
};

const consulta = (parametros: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(parametros).map(([k, v]) => [k, String(v)])).toString();

export const apiResultados = {
  /** zona: zona horaria IANA para agrupar "respuestas por día" en días locales. */
  estadisticas: (id: string, version: SeleccionVersion, zona: string) =>
    pedir<ResultadosDeFormulario>(`/formularios/${encodeURIComponent(id)}/resultados?${consulta({ version, zona })}`),
  respuestas: (id: string, version: SeleccionVersion, pagina: number, tamano = 20) =>
    pedir<PaginaDeRespuestas>(`/formularios/${encodeURIComponent(id)}/respuestas?${consulta({ version, pagina, tamano })}`),
};

/** La zona horaria del navegador de quien mira (p. ej. America/Santiago). */
export const zonaDelNavegador = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
