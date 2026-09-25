const UNIDADES: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

const formato = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/** "hace 2 horas", "ayer", "hace un momento". Usa la API estándar Intl (sin librerías de fechas). */
export function haceTiempo(fechaIso: string, ahora: Date = new Date()): string {
  const segundos = Math.round((new Date(fechaIso).getTime() - ahora.getTime()) / 1000);
  for (const [unidad, tamano] of UNIDADES) {
    if (Math.abs(segundos) >= tamano) return formato.format(Math.trunc(segundos / tamano), unidad);
  }
  return 'hace un momento';
}
