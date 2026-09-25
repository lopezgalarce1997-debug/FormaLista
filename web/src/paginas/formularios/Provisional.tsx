import { Link, useParams } from 'react-router';
import { Alerta } from '../../componentes/ui';

/** Marcador para las rutas de las pantallas que aún no existen (editor: 3, resultados: 5). */
export function Provisional({ titulo, pantalla }: { titulo: string; pantalla: number }) {
  const { id } = useParams();
  return (
    <section className="space-y-4">
      <Link to="/formularios" className="text-sm text-indigo-600 hover:underline">
        ← Mis formularios
      </Link>
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <Alerta tipo="info">
        Formulario {id}. Esta página llega en la pantalla {pantalla}.
      </Alerta>
    </section>
  );
}
