import { Navigate, Outlet, useLocation } from 'react-router';
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

/** Login y registro: si ya hay sesión, no tiene sentido mostrarlos. */
export function SoloInvitados() {
  const { usuario, cargando } = useSesion();

  if (cargando) return <Cargando />;
  if (usuario) return <Navigate to={INICIO} replace />;
  return <Outlet />;
}

/**
 * Evita un "open redirect": ?volver=https://sitio-malicioso.com o //sitio-malicioso.com
 * llevaría a otro sitio después del login. Solo se aceptan rutas internas.
 */
export function destinoSeguro(volver: string | null): string {
  return volver && volver.startsWith('/') && !volver.startsWith('//') && !volver.startsWith('/\\') ? volver : INICIO;
}
