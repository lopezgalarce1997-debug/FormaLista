import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router';
import { rutas } from '../src/App';
import { ProveedorSesion } from '../src/auth/sesion';

/** Muestra la URL actual para que las pruebas verifiquen redirecciones. */
function UbicacionActual() {
  const { pathname, search } = useLocation();
  return <output data-testid="ubicacion">{pathname + search}</output>;
}

/** Renderiza la app completa en una ruta, con un QueryClient nuevo (sin caché compartida entre pruebas). */
export function renderizarApp(ruta: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // Las mismas rutas de la app, dentro de una ruta raíz que además muestra la ubicación actual.
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            <UbicacionActual />
          </>
        ),
        children: rutas,
      },
    ],
    { initialEntries: [ruta] },
  );
  const usuario = userEvent.setup();
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <ProveedorSesion>
        <RouterProvider router={router} />
      </ProveedorSesion>
    </QueryClientProvider>,
  );
  return { ...resultado, usuario, router, queryClient };
}
