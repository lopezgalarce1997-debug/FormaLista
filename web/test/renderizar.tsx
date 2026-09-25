import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { App } from '../src/App';
import { ProveedorSesion } from '../src/auth/sesion';

/** Muestra la URL actual para que las pruebas verifiquen redirecciones. */
function UbicacionActual() {
  const { pathname, search } = useLocation();
  return <output data-testid="ubicacion">{pathname + search}</output>;
}

/** Renderiza la app completa en una ruta, con un QueryClient nuevo (sin caché compartida entre pruebas). */
export function renderizarApp(ruta: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const usuario = userEvent.setup();
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[ruta]}>
        <ProveedorSesion>
          <App />
          <UbicacionActual />
        </ProveedorSesion>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...resultado, usuario };
}
