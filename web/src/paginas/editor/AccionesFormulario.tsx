import { puede } from '@formalista/compartido';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { apiFormularios, clavesFormularios, type Detalle } from '../../api/formularios';
import { BotonCopiarLink } from '../../componentes/BotonCopiarLink';
import { Alerta, Boton } from '../../componentes/ui';
import { DialogoCompartir } from './DialogoCompartir';

/**
 * Publicar / cerrar / copiar link / compartir. Cada acción deja la respuesta de la API en la caché
 * del detalle: el editor se actualiza solo (insignia de estado, aviso de publicado, tipos bloqueados).
 */
export function AccionesFormulario({ detalle, hayCambios }: { detalle: Detalle; hayCambios: boolean }) {
  const queryClient = useQueryClient();
  const [compartiendo, setCompartiendo] = useState(false);
  const idMotivo = useId();

  const actualizarCache = async (nuevo: Detalle) => {
    queryClient.setQueryData(clavesFormularios.detalle(detalle.id), nuevo);
    await queryClient.invalidateQueries({ queryKey: clavesFormularios.lista, exact: true });
  };

  const cambiarEstado = useMutation({
    mutationFn: (accion: 'publicar' | 'cerrar') =>
      accion === 'publicar' ? apiFormularios.publicar(detalle.id) : apiFormularios.cerrar(detalle.id),
    onSuccess: actualizarCache,
  });

  // Se publica lo GUARDADO: con cambios pendientes, lo publicado no sería lo que se ve en pantalla.
  const motivoNoPublicar = hayCambios
    ? 'Guarda los cambios antes de publicar.'
    : detalle.preguntas.length === 0
      ? 'Agrega al menos una pregunta y guarda para poder publicar.'
      : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {detalle.estado === 'publicado' && <BotonCopiarLink slug={detalle.slug} tamano="normal" />}
        {puede(detalle.rol, 'cambiarEstado') &&
          (detalle.estado === 'publicado' ? (
            <Boton variante="secundario" disabled={cambiarEstado.isPending} onClick={() => cambiarEstado.mutate('cerrar')}>
              Cerrar formulario
            </Boton>
          ) : (
            <Boton
              disabled={motivoNoPublicar !== null || cambiarEstado.isPending}
              aria-describedby={motivoNoPublicar ? idMotivo : undefined}
              onClick={() => cambiarEstado.mutate('publicar')}
            >
              {detalle.estado === 'cerrado' ? 'Publicar de nuevo' : 'Publicar'}
            </Boton>
          ))}
        {puede(detalle.rol, 'compartir') && (
          <Boton variante="secundario" onClick={() => setCompartiendo(true)}>
            Compartir…
          </Boton>
        )}
      </div>
      {motivoNoPublicar && detalle.estado !== 'publicado' && puede(detalle.rol, 'cambiarEstado') && (
        <p id={idMotivo} className="text-xs text-slate-500">
          {motivoNoPublicar}
        </p>
      )}
      {cambiarEstado.isError && <Alerta>{cambiarEstado.error.message}</Alerta>}

      <DialogoCompartir detalle={detalle} abierto={compartiendo} alCerrar={() => setCompartiendo(false)} alCompartir={actualizarCache} />
    </div>
  );
}
