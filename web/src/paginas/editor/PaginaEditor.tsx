import { puede } from '@formalista/compartido';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { apiFormularios, clavesFormularios } from '../../api/formularios';
import { Cargando } from '../../componentes/Cargando';
import { Alerta, Boton, clasesBoton } from '../../componentes/ui';
import { Editor } from './Editor';

/** Carga el formulario y decide qué mostrar: el editor, "solo lectura" o un error. */
export function PaginaEditor() {
  const { id = '' } = useParams();
  const consulta = useQuery({ queryKey: clavesFormularios.detalle(id), queryFn: () => apiFormularios.obtener(id) });

  if (consulta.isPending) return <Cargando texto="Cargando formulario…" />;

  if (consulta.isError) {
    const noExiste = consulta.error instanceof ErrorApi && consulta.error.status === 404;
    return (
      <section className="space-y-4">
        <Alerta>{noExiste ? 'Formulario no encontrado.' : `No se pudo cargar el formulario: ${consulta.error.message}`}</Alerta>
        <div className="flex gap-2">
          <Link to="/formularios" className={clasesBoton('secundario')}>
            Volver a mis formularios
          </Link>
          {!noExiste && (
            <Boton variante="secundario" onClick={() => consulta.refetch()}>
              Reintentar
            </Boton>
          )}
        </div>
      </section>
    );
  }

  const detalle = consulta.data;
  if (!puede(detalle.rol, 'editar')) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">{detalle.titulo}</h1>
        <Alerta tipo="info">
          Solo lectura: tu rol ({detalle.rol}) permite ver este formulario y sus resultados, pero no editarlo.
        </Alerta>
        <Link to={`/formularios/${detalle.id}/resultados`} className={clasesBoton()}>
          Ver resultados
        </Link>
      </section>
    );
  }

  // key: si se navega a otro formulario, el editor se vuelve a montar con sus propios valores iniciales.
  return <Editor key={detalle.id} detalle={detalle} />;
}
