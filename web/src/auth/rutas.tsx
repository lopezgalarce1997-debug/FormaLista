import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { Cargando } from '../componentes/Cargando';
import { useSesion } from './sesion';

export const INICIO = '/formularios';

/** Solo con sesión. Si no hay, lleva al login recordando a dónde quería ir. */
export function RutaProtegida() {
  const { usuario, cargando } = useSesion();
  const { pathname, search } = useLocation();

  if (cargando) return <Cargando />;
  if (!usuario) return <Navigate to={`/login?volver=${encodeURIComponent(pathname + search)}`} replace />;
  return <Outlet />;
}

/**
 * Login y registro: si hay sesión, lleva a `?volver=` (o al inicio).
 * Es el ÚNICO lugar que redirige después de iniciar sesión: Login y Registro solo guardan el
 * usuario. Si además navegaran ellos, la navegación podría adelantarse a que la sesión llegue al
 * contexto (TanStack Query notifica en el ciclo siguiente) y RutaProtegida rebotaría al login,
 * perdiendo el destino.
 */
export function SoloInvitados() {
  const { usuario, cargando } = useSesion();
  const [parametros] = useSearchParams();

  if (cargando) return <Cargando />;
  if (usuario) return <Navigate to={destinoSeguro(parametros.get('volver'))} replace />;
  return <Outlet />;
}

/**
 * Evita un "open redirect": ?volver=https://sitio-malicioso.com o //sitio-malicioso.com
 * llevaría a otro sitio después del login. Solo se aceptan rutas internas.
 */
export function destinoSeguro(volver: string | null): string {
  return volver && volver.startsWith('/') && !volver.startsWith('//') && !volver.startsWith('/\\') ? volver : INICIO;
}
