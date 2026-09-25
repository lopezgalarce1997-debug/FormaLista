import { useEffect, useState } from 'react';
import { linkPublico } from '../api/formularios';
import { Boton } from './ui';

/** Copia el link público (/f/:slug) y lo confirma durante 2 segundos. */
export function BotonCopiarLink({ slug, tamano = 'chico' }: { slug: string; tamano?: 'normal' | 'chico' }) {
  const [estado, setEstado] = useState<'listo' | 'copiado' | 'error'>('listo');

  useEffect(() => {
    if (estado === 'listo') return;
    const temporizador = setTimeout(() => setEstado('listo'), 2000);
    return () => clearTimeout(temporizador);
  }, [estado]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(linkPublico(slug));
      setEstado('copiado');
    } catch {
      setEstado('error');
    }
  };

  return (
    // aria-live: el lector de pantalla anuncia "Link copiado" sin mover el foco.
    <Boton variante="secundario" tamano={tamano} onClick={copiar} aria-live="polite">
      {estado === 'copiado' ? '¡Link copiado!' : estado === 'error' ? 'No se pudo copiar' : 'Copiar link'}
    </Boton>
  );
}
