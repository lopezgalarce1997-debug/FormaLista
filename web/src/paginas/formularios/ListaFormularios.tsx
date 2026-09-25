import { useSesion } from '../../auth/sesion';
import { Alerta } from '../../componentes/ui';

/** Provisional: la pantalla 2 (lista de formularios) la reemplaza. */
export function ListaFormularios() {
  const { usuario } = useSesion();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Mis formularios</h1>
      <Alerta tipo="info">Hola, {usuario?.nombre}. La lista de formularios llega en la pantalla 2.</Alerta>
    </section>
  );
}
