// Formatos para mostrar datos en español de Chile, con la API estándar Intl (sin librerías).

const numero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
const fechaHora = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
// Las fechas "AAAA-MM-DD" no tienen hora ni zona: se formatean en UTC para que el día no se corra.
const soloFecha = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' });

/** 4.125 → "4,1" */
export const formatoNumero = (n: number) => numero.format(n);

/** Porcentaje entero; 0 si no hay total. */
export const porcentaje = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

/** Instante ISO → "25-09-2026, 14:30" en la zona del navegador. */
export const formatoFechaHora = (iso: string) => fechaHora.format(new Date(iso));

/** "2026-09-25" → "25-09-2026" (sin desfase por zona horaria). */
export function formatoFecha(aaaammdd: string): string {
  const [anio, mes, dia] = aaaammdd.split('-').map(Number);
  return soloFecha.format(new Date(Date.UTC(anio!, mes! - 1, dia!)));
}
