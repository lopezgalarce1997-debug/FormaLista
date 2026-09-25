import { createRoutesFromElements, Navigate, Route } from 'react-router';
import { INICIO, RutaProtegida, SoloInvitados } from './auth/rutas';
import { Layout } from './componentes/Layout';
import { Login } from './paginas/auth/Login';
import { Registro } from './paginas/auth/Registro';
import { PaginaEditor } from './paginas/editor/PaginaEditor';
import { ListaFormularios } from './paginas/formularios/ListaFormularios';
import { Provisional } from './paginas/formularios/Provisional';

/**
 * Definición de las rutas. Se usa con un "data router" (createBrowserRouter en main.tsx y
 * createMemoryRouter en las pruebas): es lo que permite useBlocker (avisar de cambios sin guardar).
 */
export const rutas = createRoutesFromElements(
  <>
    <Route element={<SoloInvitados />}>
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Registro />} />
    </Route>

    <Route element={<RutaProtegida />}>
      <Route element={<Layout />}>
        <Route path="/formularios" element={<ListaFormularios />} />
        <Route path="/formularios/:id/editar" element={<PaginaEditor />} />
        <Route path="/formularios/:id/resultados" element={<Provisional titulo="Resultados" pantalla={5} />} />
      </Route>
    </Route>

    <Route path="*" element={<Navigate to={INICIO} replace />} />
  </>,
);
