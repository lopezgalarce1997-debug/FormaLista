/** Error de la API con el mismo formato que devuelve el servidor: { error, detalles? }. */
export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
    readonly detalles: { campo: string; mensaje: string }[] = [],
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const SIN_CONEXION = 'No se pudo conectar con el servidor. Intenta de nuevo en unos segundos.';

let alExpirarSesion: (() => void) | null = null;

/** El proveedor de sesión se registra aquí para enterarse de un 401 en cualquier llamada. */
export function alRecibirNoAutorizado(accion: (() => void) | null): void {
  alExpirarSesion = accion;
}

/**
 * Única puerta de salida hacia la API. La sesión viaja en la cookie httpOnly (el navegador la
 * envía sola: credentials 'same-origin'); este código nunca ve el token.
 */
export async function pedir<T>(ruta: string, opciones: { metodo?: Metodo; cuerpo?: unknown } = {}): Promise<T> {
  const { metodo = 'GET', cuerpo } = opciones;
  // URL absoluta: en las pruebas (Node) fetch no resuelve rutas relativas.
  const url = new URL(`/api${ruta}`, window.location.origin);

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, SIN_CONEXION);
  }

  // 502/503/504: la respuesta la dio un intermediario (el proxy de Vite o uno de producción) porque
  // la API no contestó. Para quien usa la app es lo mismo que no tener conexión.
  if (respuesta.status >= 502 && respuesta.status <= 504) throw new ErrorApi(respuesta.status, SIN_CONEXION);
  if (respuesta.status === 204) return undefined as T;
  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    // Un 401 fuera de /auth significa que la sesión expiró. En /auth/* es parte del flujo
    // (credenciales inválidas o "no hay sesión todavía") y no debe cerrar nada.
    if (respuesta.status === 401 && !ruta.startsWith('/auth/')) alExpirarSesion?.();
    throw new ErrorApi(respuesta.status, datos?.error ?? 'Ocurrió un error inesperado', datos?.detalles ?? []);
  }
  return datos as T;
}
