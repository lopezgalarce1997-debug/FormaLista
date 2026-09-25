import { Navigate, Route, Routes } from 'react-router';
import { INICIO, RutaProtegida, SoloInvitados } from './auth/rutas';
import { Layout } from './componentes/Layout';
import { Login } from './paginas/auth/Login';
import { Registro } from './paginas/auth/Registro';
import { ListaFormularios } from './paginas/formularios/ListaFormularios';
import { Provisional } from './paginas/formularios/Provisional';

/** Rutas de la app. No crea el router: así las pruebas la envuelven en un MemoryRouter. */
export function App() {
  return (
    <Routes>
      <Route element={<SoloInvitados />}>
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Registro />} />
      </Route>

      <Route element={<RutaProtegida />}>
        <Route element={<Layout />}>
          <Route path="/formularios" element={<ListaFormularios />} />
          <Route path="/formularios/:id/editar" element={<Provisional titulo="Editor" pantalla={3} />} />
          <Route path="/formularios/:id/resultados" element={<Provisional titulo="Resultados" pantalla={5} />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={INICIO} replace />} />
    </Routes>
  );
}
