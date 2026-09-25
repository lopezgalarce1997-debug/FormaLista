import { toNestErrors } from '@hookform/resolvers';
import {
  erroresDeDefinicion,
  esquemaActualizacion,
  type ErrorDefinicion,
  type Pregunta,
  type TipoPregunta,
} from '@formalista/compartido';
import type { FieldError, Resolver } from 'react-hook-form';
import type { CuerpoActualizacion, Detalle } from '../../api/formularios';

/**
 * Modelo del formulario EN LA INTERFAZ (distinto al de la API):
 * - Cada pregunta guarda todos los campos de todos los tipos: cambiar de tipo y volver no pierde datos.
 * - Las opciones son objetos { texto } porque useFieldArray solo maneja listas de objetos.
 * Al guardar, aCuerpoApi() lo convierte a la forma exacta que valida la API.
 */
export interface PreguntaEditable {
  /** Solo en preguntas ya guardadas: es la identidad que usa el versionado. */
  id?: string;
  tipo: TipoPregunta;
  texto: string;
  obligatoria: boolean;
  opciones: { texto: string }[];
  minimo: number;
  maximo: number;
}

export interface FormularioEditable {
  titulo: string;
  descripcion: string;
  preguntas: PreguntaEditable[];
}

export const esDeOpciones = (tipo: TipoPregunta) => tipo === 'opcion_unica' || tipo === 'opcion_multiple';

export const opcionesPorDefecto = () => [{ texto: 'Opción 1' }, { texto: 'Opción 2' }];

export function preguntaNueva(tipo: TipoPregunta): PreguntaEditable {
  return {
    tipo,
    texto: '',
    obligatoria: false,
    opciones: esDeOpciones(tipo) ? opcionesPorDefecto() : [],
    minimo: 1,
    maximo: 5,
  };
}

/** API → interfaz. */
export function aEditable(detalle: Detalle): FormularioEditable {
  return {
    titulo: detalle.titulo,
    descripcion: detalle.descripcion,
    preguntas: detalle.preguntas.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      texto: p.texto,
      obligatoria: p.obligatoria,
      opciones: 'opciones' in p ? p.opciones.map((texto) => ({ texto })) : [],
      minimo: 'minimo' in p ? p.minimo : 1,
      maximo: 'maximo' in p ? p.maximo : 5,
    })),
  };
}

/** Interfaz → API: solo los campos que corresponden al tipo de cada pregunta. */
export function aCuerpoApi(valores: FormularioEditable, version: number): CuerpoActualizacion {
  return {
    titulo: valores.titulo,
    descripcion: valores.descripcion,
    version,
    preguntas: valores.preguntas.map((p) => {
      const base = { ...(p.id ? { id: p.id } : {}), texto: p.texto, obligatoria: p.obligatoria };
      switch (p.tipo) {
        case 'opcion_unica':
        case 'opcion_multiple':
          return { ...base, tipo: p.tipo, opciones: p.opciones.map((o) => o.texto) };
        case 'escala':
          return { ...base, tipo: 'escala', minimo: p.minimo, maximo: p.maximo };
        default:
          return { ...base, tipo: p.tipo };
      }
    }),
  };
}

/**
 * Ruta de un error de la API/Zod (sobre el cuerpo de la API) → ruta del campo en el formulario.
 * Ej.: preguntas.2.opciones.1 → preguntas.2.opciones.1.texto (las opciones son objetos aquí).
 */
export function rutaEnFormulario(ruta: readonly PropertyKey[]): string {
  const [raiz, indice, campo, subIndice] = ruta;
  if (raiz === 'preguntas' && indice === undefined) return 'preguntas.root';
  if (raiz === 'preguntas' && campo === 'opciones') {
    return subIndice === undefined ? `preguntas.${String(indice)}.opciones.root` : `preguntas.${String(indice)}.opciones.${String(subIndice)}.texto`;
  }
  if (raiz === 'version') return 'root.servidor';
  return ruta.map(String).join('.');
}

function rutaDeDefinicion({ indice, campo }: ErrorDefinicion): string {
  if (campo === 'opciones') return `preguntas.${indice}.opciones.root`;
  if (campo === 'minimo') return `preguntas.${indice}.minimo`;
  return 'root.servidor'; // id repetido: no hay un campo visible para mostrarlo
}

/**
 * Validación del editor con las MISMAS reglas que la API: la forma (esquemaActualizacion) y las
 * reglas de negocio del dominio (erroresDeDefinicion). Se evalúan las dos SIEMPRE, para mostrar todos
 * los errores juntos (y no uno por vez); si ambas marcan el mismo campo, gana el de forma.
 */
export const resolverEditor: Resolver<FormularioEditable> = async (valores, _contexto, opciones) => {
  const errores: Record<string, FieldError> = {};
  const agregar = (ruta: string, mensaje: string) => {
    errores[ruta] ??= { type: 'validacion', message: mensaje };
  };

  const cuerpo = aCuerpoApi(valores, 1);
  const forma = esquemaActualizacion.safeParse(cuerpo);
  if (!forma.success) forma.error.issues.forEach((issue) => agregar(rutaEnFormulario(issue.path), issue.message));

  // Las reglas del dominio no necesitan que la forma sea válida (un texto vacío no les afecta).
  // Las preguntas nuevas aún no tienen id: se usa uno temporal para que la regla de ids únicos no falle.
  const preguntas = (cuerpo.preguntas ?? []).map((p, i) => ({ ...p, id: p.id ?? `nueva-${i}` }) as Pregunta);
  erroresDeDefinicion(preguntas).forEach((error) => agregar(rutaDeDefinicion(error), error.mensaje));

  if (Object.keys(errores).length === 0) return { values: valores, errors: {} };
  return { values: {}, errors: toNestErrors(errores, opciones) };
};
