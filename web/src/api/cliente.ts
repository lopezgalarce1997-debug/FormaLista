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
    throw new ErrorApi(0, 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }

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
