import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ErrorApi } from './api/cliente';
import { rutas } from './App';
import { ProveedorSesion } from './auth/sesion';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reintentar solo errores de red o del servidor (5xx). Un 4xx no cambia por reintentar.
      retry: (intentos, error) => intentos < 2 && !(error instanceof ErrorApi && error.status >= 400 && error.status < 500),
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter(rutas);

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ProveedorSesion>
        <RouterProvider router={router} />
      </ProveedorSesion>
    </QueryClientProvider>
  </StrictMode>,
);
