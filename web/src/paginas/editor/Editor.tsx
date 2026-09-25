import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FormProvider, useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { Link, useBlocker } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { apiFormularios, clavesFormularios, type Detalle } from '../../api/formularios';
import { Dialogo } from '../../componentes/Dialogo';
import { InsigniaEstado } from '../../componentes/insignias';
import { NOMBRE_TIPO, TIPOS } from '../../componentes/tiposPregunta';
import { Alerta, Boton, Campo } from '../../componentes/ui';
import { AccionesFormulario } from './AccionesFormulario';
import {
  aCuerpoApi,
  aEditable,
  aPreguntasVista,
  preguntaNueva,
  resolverEditor,
  rutaEnFormulario,
  type FormularioEditable,
} from './modelo';
import { TarjetaPregunta } from './TarjetaPregunta';
import { VistaPrevia } from './VistaPrevia';

/**
 * Editor de un formulario. Guardado MANUAL: en un formulario publicado, cada guardado que cambia
 * preguntas crea una versión nueva, así que un autoguardado llenaría el historial de versiones.
 */
export function Editor({ detalle }: { detalle: Detalle }) {
  const queryClient = useQueryClient();
  // La versión que se está editando: viaja en el PUT (concurrencia optimista) y se actualiza al guardar.
  const [version, setVersion] = useState(detalle.version);
  const [aviso, setAviso] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState(false);
  const [enfocar, setEnfocar] = useState<{ clave: string; direccion: 'subir' | 'bajar' } | null>(null);
  const [pestana, setPestana] = useState<Pestana>('editar');

  const formulario = useForm<FormularioEditable>({ defaultValues: aEditable(detalle), resolver: resolverEditor });
  const { register, handleSubmit, reset, setError, formState, control } = formulario;
  // keyName 'clave': por defecto useFieldArray usa "id" como clave interna y pisaría el id de la pregunta.
  const { fields, append, remove, move } = useFieldArray({ control, name: 'preguntas', keyName: 'clave' });

  const guardar = useMutation({
    mutationFn: (valores: FormularioEditable) => apiFormularios.actualizar(detalle.id, aCuerpoApi(valores, version)),
    onSuccess: async (guardado) => {
      queryClient.setQueryData(clavesFormularios.detalle(detalle.id), guardado);
      await queryClient.invalidateQueries({ queryKey: clavesFormularios.lista, exact: true });
      setAviso(
        guardado.version > version
          ? `Guardado. Se creó la versión ${guardado.version}: las respuestas anteriores se conservan con sus preguntas originales.`
          : 'Cambios guardados.',
      );
      setVersion(guardado.version);
      reset(aEditable(guardado)); // ids asignados por el servidor y el formulario vuelve a "sin cambios"
    },
    onError: (error) => {
      if (error instanceof ErrorApi && error.status === 409) return setConflicto(true);
      if (error instanceof ErrorApi && error.detalles.length > 0) {
        // La ruta se arma en tiempo de ejecución a partir del error de la API: TypeScript no puede verificarla.
        error.detalles.forEach((d) =>
          setError(rutaEnFormulario(d.campo.split('.').map(aSegmento)) as FieldPath<FormularioEditable>, { message: d.mensaje }),
        );
        return;
      }
      setError('root.servidor', { message: error.message });
    },
  });

  const recargar = async () => {
    const fresco = await queryClient.fetchQuery({
      queryKey: clavesFormularios.detalle(detalle.id),
      queryFn: () => apiFormularios.obtener(detalle.id),
      staleTime: 0,
    });
    setVersion(fresco.version);
    reset(aEditable(fresco));
    setConflicto(false);
    setAviso('Se cargó la última versión guardada.');
  };

  // Aviso al navegar dentro de la app con cambios sin guardar…
  const bloqueo = useBlocker(({ currentLocation, nextLocation }) => formState.isDirty && currentLocation.pathname !== nextLocation.pathname);
  // …y al cerrar o recargar la pestaña (el navegador muestra su propio aviso).
  useEffect(() => {
    if (!formState.isDirty) return;
    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [formState.isDirty]);

  // Después de reordenar, el foco sigue a la pregunta movida (se puede reordenar solo con teclado).
  useEffect(() => {
    if (!enfocar) return;
    const preferido = document.getElementById(`${enfocar.direccion}-${enfocar.clave}`) as HTMLButtonElement | null;
    const otro = document.getElementById(`${enfocar.direccion === 'subir' ? 'bajar' : 'subir'}-${enfocar.clave}`);
    (preferido && !preferido.disabled ? preferido : otro)?.focus();
    setEnfocar(null);
  }, [enfocar, fields]);

  const mover = (desde: number, hacia: number, direccion: 'subir' | 'bajar') => {
    const clave = fields[desde]!.clave;
    move(desde, hacia);
    setEnfocar({ clave, direccion });
  };

  const publicado = detalle.estado !== 'borrador';

  return (
    <FormProvider {...formulario}>
      <div className="space-y-6">
        <div className="space-y-2">
          <Link to="/formularios" className="text-sm text-indigo-600 hover:underline">
            ← Mis formularios
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{detalle.titulo}</h1>
            <InsigniaEstado estado={detalle.estado} />
            <span className="text-sm text-slate-500">versión {version}</span>
            {detalle.equipo && <span className="text-sm text-slate-500">· Compartido con {detalle.equipo.nombre}</span>}
            <div className="ml-auto flex items-center gap-3">
              {formState.isDirty && <span className="text-sm text-amber-700">Cambios sin guardar</span>}
              {/* form=: el botón está fuera del <form> pero lo envía igual. */}
              <Boton type="submit" form={ID_FORMULARIO} disabled={!formState.isDirty || guardar.isPending}>
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Boton>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <Pestanas activa={pestana} alCambiar={setPestana} />
          <AccionesFormulario detalle={detalle} hayCambios={formState.isDirty} />
        </div>

        {aviso && <Alerta tipo="info">{aviso}</Alerta>}
        {formState.errors.root?.servidor && <Alerta>{formState.errors.root.servidor.message}</Alerta>}
        {publicado && (
          <Alerta tipo="info">
            Este formulario ya fue publicado: si cambias las preguntas, al guardar se creará una nueva versión. Las respuestas
            recibidas se conservan con sus preguntas originales.
          </Alerta>
        )}

        {/* El editor se oculta (no se desmonta) en la vista previa: así no se pierde nada de lo escrito. */}
        <form
          id={ID_FORMULARIO}
          role="tabpanel"
          aria-labelledby="pestana-editar"
          hidden={pestana !== 'editar'}
          onSubmit={handleSubmit(
            (valores) => {
              setAviso(null);
              guardar.mutate(valores);
            },
            // Si hay errores y se guardó desde la vista previa, se vuelve al editor para mostrarlos.
            () => setPestana('editar'),
          )}
          noValidate
          className="space-y-6"
        >
          <div className="grid gap-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <Campo id="titulo" etiqueta="Título" error={formState.errors.titulo?.message} {...register('titulo')} />
            <Campo id="descripcion" etiqueta="Descripción (opcional)" error={formState.errors.descripcion?.message} {...register('descripcion')} />
          </div>
  
          <section aria-label="Preguntas" className="space-y-4">
            {fields.length === 0 && <p className="text-sm text-slate-500">Aún no hay preguntas. Agrega la primera:</p>}
            {fields.map((campo, i) => (
              <TarjetaPregunta
                key={campo.clave}
                clave={campo.clave}
                indice={i}
                total={fields.length}
                tipoBloqueado={publicado && Boolean(campo.id)}
                alSubir={() => mover(i, i - 1, 'subir')}
                alBajar={() => mover(i, i + 1, 'bajar')}
                alEliminar={() => remove(i)}
              />
            ))}
            {formState.errors.preguntas?.root && <Alerta>{formState.errors.preguntas.root.message}</Alerta>}
          </section>
  
          <div className="rounded-xl border-2 border-dashed border-slate-300 p-4">
            <p className="text-sm font-medium text-slate-700">Agregar pregunta</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TIPOS.map((tipo) => (
                <Boton
                  key={tipo}
                  variante="secundario"
                  tamano="chico"
                  onClick={() => append(preguntaNueva(tipo), { focusName: `preguntas.${fields.length}.texto` })}
                >
                  + {NOMBRE_TIPO[tipo]}
                </Boton>
              ))}
            </div>
          </div>
        </form>

        {/* Fuera del <form>: un Enter en un campo de la vista previa no debe guardar el formulario. */}
        {pestana === 'vista' && (
          <div role="tabpanel" aria-labelledby="pestana-vista">
            <VistaPrevia
              titulo={formulario.getValues('titulo')}
              descripcion={formulario.getValues('descripcion')}
              preguntas={aPreguntasVista(formulario.getValues())}
            />
          </div>
        )}
      </div>

      <Dialogo abierto={conflicto} alCerrar={() => setConflicto(false)} titulo="Otra persona modificó este formulario">
        <p className="text-sm text-slate-600">
          Alguien guardó cambios mientras editabas. Si recargas, verás su versión y perderás lo que no has guardado. Si sigues
          editando, conservas tus cambios en pantalla (por ejemplo, para copiarlos) pero no podrás guardarlos sobre la versión nueva.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setConflicto(false)}>
            Seguir editando
          </Boton>
          <Boton onClick={recargar}>Recargar</Boton>
        </div>
      </Dialogo>

      <Dialogo abierto={bloqueo.state === 'blocked'} alCerrar={() => bloqueo.reset?.()} titulo="Tienes cambios sin guardar">
        <p className="text-sm text-slate-600">Si sales ahora, perderás los cambios que no guardaste.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => bloqueo.reset?.()}>
            Quedarme
          </Boton>
          <Boton variante="peligro" onClick={() => bloqueo.proceed?.()}>
            Salir sin guardar
          </Boton>
        </div>
      </Dialogo>
    </FormProvider>
  );
}

const ID_FORMULARIO = 'formulario-editor';

type Pestana = 'editar' | 'vista';

/**
 * Pestañas con el patrón accesible de WAI-ARIA: role tablist/tab/tabpanel, aria-selected, y
 * flechas ← → para cambiar de pestaña (con Tab se sale del grupo, no se recorre cada pestaña).
 */
function Pestanas({ activa, alCambiar }: { activa: Pestana; alCambiar: (p: Pestana) => void }) {
  const pestanas: { valor: Pestana; texto: string }[] = [
    { valor: 'editar', texto: 'Editar' },
    { valor: 'vista', texto: 'Vista previa' },
  ];
  const alTeclear = (evento: React.KeyboardEvent) => {
    if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return;
    const siguiente = activa === 'editar' ? 'vista' : 'editar';
    alCambiar(siguiente);
    document.getElementById(`pestana-${siguiente}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Modo" className="inline-flex rounded-lg bg-slate-100 p-1" onKeyDown={alTeclear}>
      {pestanas.map(({ valor, texto }) => (
        <button
          key={valor}
          id={`pestana-${valor}`}
          type="button"
          role="tab"
          aria-selected={activa === valor}
          tabIndex={activa === valor ? 0 : -1}
          onClick={() => alCambiar(valor)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            activa === valor ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

/** "preguntas.0.opciones.1" viene como texto: los segmentos numéricos vuelven a ser números. */
function aSegmento(segmento: string): string | number {
  return /^\d+$/.test(segmento) ? Number(segmento) : segmento;
}
