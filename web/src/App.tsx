import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createRoutesFromElements, Navigate, Route } from 'react-router';
import { INICIO, RutaProtegida, SoloInvitados } from './auth/rutas';
import { Cargando } from './componentes/Cargando';
import { Layout } from './componentes/Layout';

/**
 * Cada página es un archivo JavaScript aparte que se descarga al visitarla (React.lazy).
 * Quien abre un link público descarga solo lo necesario para responder: ni el editor ni los
 * gráficos de resultados. Las páginas exportan con nombre, por eso el adaptador { default }.
 */
function perezosa<M>(cargar: () => Promise<M>, nombre: keyof M) {
  return lazy(() => cargar().then((modulo) => ({ default: modulo[nombre] as ComponentType })));
}

const Login = perezosa(() => import('./paginas/auth/Login'), 'Login');
const Registro = perezosa(() => import('./paginas/auth/Registro'), 'Registro');
const ListaFormularios = perezosa(() => import('./paginas/formularios/ListaFormularios'), 'ListaFormularios');
const PaginaEditor = perezosa(() => import('./paginas/editor/PaginaEditor'), 'PaginaEditor');
const PaginaResultados = perezosa(() => import('./paginas/resultados/PaginaResultados'), 'PaginaResultados');
const PaginaPublica = perezosa(() => import('./paginas/publico/PaginaPublica'), 'PaginaPublica');

/** Mientras se descarga el archivo de la página, se muestra "Cargando…". */
const conCarga = (pagina: ReactNode) => <Suspense fallback={<Cargando />}>{pagina}</Suspense>;

/**
 * Definición de las rutas. Se usa con un "data router" (createBrowserRouter en main.tsx y
 * createMemoryRouter en las pruebas): es lo que permite useBlocker (avisar de cambios sin guardar).
 */
export const rutas = createRoutesFromElements(
  <>
    {/* Pública: sin sesión y sin la barra de la app. */}
    <Route path="/f/:slug" element={conCarga(<PaginaPublica />)} />

    <Route element={<SoloInvitados />}>
      <Route path="/login" element={conCarga(<Login />)} />
      <Route path="/registro" element={conCarga(<Registro />)} />
    </Route>

    <Route element={<RutaProtegida />}>
      <Route element={<Layout />}>
        <Route path="/formularios" element={conCarga(<ListaFormularios />)} />
        <Route path="/formularios/:id/editar" element={conCarga(<PaginaEditor />)} />
        <Route path="/formularios/:id/resultados" element={conCarga(<PaginaResultados />)} />
      </Route>
    </Route>

    <Route path="*" element={<Navigate to={INICIO} replace />} />
  </>,
);
