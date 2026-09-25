import { TIPOS_PREGUNTA, type TipoPregunta } from '@formalista/compartido';

export const NOMBRE_TIPO: Record<TipoPregunta, string> = {
  texto_corto: 'Texto corto',
  texto_largo: 'Texto largo',
  opcion_unica: 'Opción única',
  opcion_multiple: 'Opción múltiple',
  escala: 'Escala',
  fecha: 'Fecha',
};

export const TIPOS: readonly TipoPregunta[] = TIPOS_PREGUNTA;
