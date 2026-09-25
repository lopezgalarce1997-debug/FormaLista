import { useMutation } from '@tanstack/react-query';
import { Link, NavLink, Outlet } from 'react-router';
import { useSesion } from '../auth/sesion';
import { Boton } from './ui';

const enlace = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:text-slate-900'}`;

/** Estructura de las pantallas con sesión: barra superior + contenido. */
export function Layout() {
  const { usuario, cerrarSesion } = useSesion();
  const salir = useMutation({ mutationFn: cerrarSesion });

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link to="/formularios" className="text-lg font-bold tracking-tight text-indigo-600">
            FormaLista
          </Link>
          <nav className="flex gap-1">
            <NavLink to="/formularios" className={enlace}>
              Formularios
            </NavLink>
            <NavLink to="/equipos" className={enlace}>
              Equipos
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{usuario?.nombre}</span>
            <Boton variante="secundario" onClick={() => salir.mutate()} disabled={salir.isPending}>
              Cerrar sesión
            </Boton>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
