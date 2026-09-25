import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { apiPublico, clavesPublico } from '../../api/publico';
import { Cargando } from '../../componentes/Cargando';
import { Alerta, Boton } from '../../componentes/ui';
import { FormularioParaResponder } from './FormularioParaResponder';
import { Aviso, MarcoPublico } from './marco';

/** /f/:slug — la página que responde cualquier persona, sin cuenta. Sin la barra de la app. */
export function PaginaPublica() {
  const { slug = '' } = useParams();
  const consulta = useQuery({ queryKey: clavesPublico.formulario(slug), queryFn: () => apiPublico.obtener(slug) });

  // El título de la pestaña del navegador es el del formulario.
  useEffect(() => {
    if (!consulta.data) return;
    const anterior = document.title;
    document.title = `${consulta.data.titulo} · FormaLista`;
    return () => {
      document.title = anterior;
    };
  }, [consulta.data]);

  return (
    <MarcoPublico>
      {consulta.isPending && <Cargando texto="Cargando formulario…" />}
      {consulta.isError && <ErrorAlCargar error={consulta.error} alReintentar={() => consulta.refetch()} />}
      {consulta.isSuccess && (
        // key: si cambia la versión, el formulario (y su borrador) empiezan de nuevo.
        <FormularioParaResponder key={`${slug}:${consulta.data.version}`} formulario={consulta.data} />
      )}
    </MarcoPublico>
  );
}

function ErrorAlCargar({ error, alReintentar }: { error: Error; alReintentar: () => void }) {
  const status = error instanceof ErrorApi ? error.status : 0;
  if (status === 404) return <Aviso titulo="Formulario no disponible">Este formulario no existe o todavía no está publicado.</Aviso>;
  if (status === 410) return <Aviso titulo="Formulario cerrado">Este formulario ya no acepta respuestas.</Aviso>;
  return (
    <div className="space-y-3">
      <Alerta>{error.message}</Alerta>
      <Boton variante="secundario" onClick={alReintentar}>
        Reintentar
      </Boton>
    </div>
  );
}
