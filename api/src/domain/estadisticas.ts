import type { Pregunta, TipoPregunta, VersionFormulario } from './formulario.js';

/** 'todas' combina las versiones; un número muestra exactamente esa versión. */
export type SeleccionVersion = number | 'todas';

/**
 * Lo que devuelve la agregación de MongoDB: conteos "crudos" agrupados por versión y pregunta.
 * No sabe nada de cómo combinar versiones; eso lo decide construirResultados.
 */
export interface AgregadosCrudos {
  total: number;
  porVersion: { version: number; cantidad: number }[];
  porDia: { dia: string; cantidad: number }[];
  /** Cuántas respuestas contestaron cada pregunta, por versión. */
  respondidas: { version: number; preguntaId: string; cantidad: number }[];
  /** Conteo por valor de preguntas de opción y de escala (la opción múltiple ya viene "desenrollada"). */
  conteos: { version: number; preguntaId: string; valor: string | number; cantidad: number }[];
  /** Suma y cantidad (no promedio): así se pueden combinar versiones con un promedio ponderado. */
  escalas: { version: number; preguntaId: string; suma: number; cantidad: number }[];
  fechas: { version: number; preguntaId: string; primera: string; ultima: string }[];
  textos: { preguntaId: string; ultimos: { valor: string; enviadaEn: Date }[] }[];
}

export interface ConteoOpcion {
  valor: string;
  cantidad: number;
  /** El valor se respondió en una versión anterior, pero ya no es una opción vigente. */
  yaNoExiste?: true;
}

interface EstadisticaBase {
  id: string;
  texto: string;
  /** Versiones (entre las consideradas) en las que existe la pregunta. */
  versiones: number[];
  textoCambio: boolean;
  respondieron: number;
  /** Respuestas de las versiones donde la pregunta existía: el denominador correcto. */
  posibles: number;
}

export type EstadisticaPregunta =
  | (EstadisticaBase & { tipo: 'opcion_unica' | 'opcion_multiple'; opciones: ConteoOpcion[] })
  | (EstadisticaBase & {
      tipo: 'escala';
      minimo: number;
      maximo: number;
      promedio: number | null;
      distribucion: { valor: number; cantidad: number }[];
      advertencia: string | null;
    })
  | (EstadisticaBase & { tipo: 'fecha'; primera: string | null; ultima: string | null })
  | (EstadisticaBase & { tipo: 'texto_corto' | 'texto_largo'; ultimos: { valor: string; enviadaEn: Date }[] });

export interface Resultados {
  version: SeleccionVersion;
  total: number;
  porVersion: { version: number; cantidad: number }[];
  porDia: { dia: string; cantidad: number }[];
  preguntas: EstadisticaPregunta[];
  /** Solo en 'todas': preguntas que existieron en versiones anteriores pero ya no están. */
  preguntasAnteriores: EstadisticaPregunta[];
}

/** Agrupa los ids de las preguntas por tipo (el servicio los usa para armar la agregación). */
export function idsPorTipo(versiones: VersionFormulario[]): Map<TipoPregunta, string[]> {
  const tipos = new Map<string, TipoPregunta>();
  // El tipo de un id nunca cambia entre versiones (regla del paso 8), así que el mapa es consistente.
  versiones.forEach((v) => v.preguntas.forEach((p) => tipos.set(p.id, p.tipo)));

  const resultado = new Map<TipoPregunta, string[]>();
  tipos.forEach((tipo, id) => resultado.set(tipo, [...(resultado.get(tipo) ?? []), id]));
  return resultado;
}

/**
 * Convierte los agregados crudos en estadísticas por pregunta, combinando versiones:
 * - Cada pregunta usa la definición de la versión de referencia (la más reciente considerada).
 * - Junta las respuestas de todas las versiones donde existe ese id (el tipo nunca cambia).
 * - "posibles" cuenta solo las respuestas de versiones donde la pregunta existía.
 * - Opciones que ya no existen → bucket aparte con yaNoExiste. Opciones sin votos → 0.
 * - Escala: solo combina versiones con el mismo rango que la referencia; si quedan respuestas
 *   fuera, lo advierte. El promedio es ponderado (Σ sumas / Σ cantidades).
 */
export function construirResultados(
  versiones: VersionFormulario[],
  crudos: AgregadosCrudos,
  seleccion: SeleccionVersion,
): Resultados {
  const consideradas = [...versiones]
    .filter((v) => seleccion === 'todas' || v.version === seleccion)
    .sort((a, b) => a.version - b.version);
  const referencia = consideradas.at(-1);

  const apariciones = new Map<string, { version: number; pregunta: Pregunta }[]>();
  consideradas.forEach(({ version, preguntas }) =>
    preguntas.forEach((pregunta) =>
      apariciones.set(pregunta.id, [...(apariciones.get(pregunta.id) ?? []), { version, pregunta }]),
    ),
  );

  const cantidadPorVersion = new Map(crudos.porVersion.map((f) => [f.version, f.cantidad]));
  const estadistica = (pregunta: Pregunta) =>
    estadisticaDe(pregunta, apariciones.get(pregunta.id) ?? [], crudos, cantidadPorVersion);

  const idsReferencia = new Set(referencia?.preguntas.map((p) => p.id));
  const anteriores = [...apariciones.values()]
    .filter((ap) => !idsReferencia.has(ap[0]!.pregunta.id))
    .map((ap) => estadistica(ap.at(-1)!.pregunta)); // su última definición conocida

  return {
    version: seleccion,
    total: crudos.total,
    porVersion: [...crudos.porVersion].sort((a, b) => a.version - b.version),
    porDia: completarDias(crudos.porDia),
    preguntas: (referencia?.preguntas ?? []).map(estadistica),
    preguntasAnteriores: anteriores,
  };
}

function estadisticaDe(
  ref: Pregunta,
  apariciones: { version: number; pregunta: Pregunta }[],
  crudos: AgregadosCrudos,
  cantidadPorVersion: Map<number, number>,
): EstadisticaPregunta {
  const versiones = apariciones.map((a) => a.version);
  const enVersiones = (vs: number[]) => (fila: { version: number; preguntaId: string }) =>
    fila.preguntaId === ref.id && vs.includes(fila.version);

  const base: EstadisticaBase = {
    id: ref.id,
    texto: ref.texto,
    versiones,
    textoCambio: apariciones.some((a) => a.pregunta.texto !== ref.texto),
    respondieron: sumar(crudos.respondidas.filter(enVersiones(versiones))),
    posibles: versiones.reduce((total, v) => total + (cantidadPorVersion.get(v) ?? 0), 0),
  };

  switch (ref.tipo) {
    case 'opcion_unica':
    case 'opcion_multiple': {
      const porValor = new Map<string, number>();
      crudos.conteos
        .filter(enVersiones(versiones))
        .forEach((c) => porValor.set(String(c.valor), (porValor.get(String(c.valor)) ?? 0) + c.cantidad));

      const vigentes: ConteoOpcion[] = ref.opciones.map((valor) => ({ valor, cantidad: porValor.get(valor) ?? 0 }));
      const eliminadas: ConteoOpcion[] = [...porValor]
        .filter(([valor]) => !ref.opciones.includes(valor))
        .map(([valor, cantidad]) => ({ valor, cantidad, yaNoExiste: true as const }))
        .sort((a, b) => b.cantidad - a.cantidad || a.valor.localeCompare(b.valor));
      return { ...base, tipo: ref.tipo, opciones: [...vigentes, ...eliminadas] };
    }

    case 'escala': {
      const mismoRango = apariciones
        .filter((a) => a.pregunta.tipo === 'escala' && a.pregunta.minimo === ref.minimo && a.pregunta.maximo === ref.maximo)
        .map((a) => a.version);
      const escalas = crudos.escalas.filter(enVersiones(mismoRango));
      const suma = escalas.reduce((t, e) => t + e.suma, 0);
      const cantidad = sumar(escalas);
      const fuera = sumar(crudos.escalas.filter(enVersiones(versiones.filter((v) => !mismoRango.includes(v)))));

      const distribucion = [];
      for (let valor = ref.minimo; valor <= ref.maximo; valor++) {
        distribucion.push({
          valor,
          cantidad: sumar(crudos.conteos.filter((c) => enVersiones(mismoRango)(c) && c.valor === valor)),
        });
      }

      return {
        ...base,
        tipo: 'escala',
        minimo: ref.minimo,
        maximo: ref.maximo,
        promedio: cantidad > 0 ? Math.round((suma / cantidad) * 100) / 100 : null,
        distribucion,
        advertencia:
          fuera > 0
            ? `El rango cambió entre versiones: solo se combinan las versiones con rango ${ref.minimo}–${ref.maximo}; quedaron fuera ${fuera} respuestas`
            : null,
      };
    }

    case 'fecha': {
      const fechas = crudos.fechas.filter(enVersiones(versiones));
      return {
        ...base,
        tipo: 'fecha',
        primera: fechas.map((f) => f.primera).sort()[0] ?? null,
        ultima: fechas.map((f) => f.ultima).sort().at(-1) ?? null,
      };
    }

    case 'texto_corto':
    case 'texto_largo':
      return { ...base, tipo: ref.tipo, ultimos: crudos.textos.find((t) => t.preguntaId === ref.id)?.ultimos ?? [] };
  }
}

function sumar(filas: { cantidad: number }[]): number {
  return filas.reduce((total, f) => total + f.cantidad, 0);
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Agrega los días sin respuestas (cantidad 0) entre el primero y el último, para que un gráfico
 * no se salte días. Se calcula en UTC sobre fechas "AAAA-MM-DD": sin horas, el cambio de horario
 * de verano no puede duplicar ni saltar días.
 */
export function completarDias(porDia: { dia: string; cantidad: number }[]): { dia: string; cantidad: number }[] {
  if (porDia.length === 0) return [];
  const cantidades = new Map(porDia.map((d) => [d.dia, d.cantidad]));
  const dias = [...cantidades.keys()].sort();

  const resultado = [];
  for (let t = Date.parse(`${dias[0]}T00:00:00Z`); t <= Date.parse(`${dias.at(-1)}T00:00:00Z`); t += UN_DIA_MS) {
    const dia = new Date(t).toISOString().slice(0, 10);
    resultado.push({ dia, cantidad: cantidades.get(dia) ?? 0 });
  }
  return resultado;
}
