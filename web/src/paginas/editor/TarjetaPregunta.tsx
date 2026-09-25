import type { TipoPregunta } from '@formalista/compartido';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { NOMBRE_TIPO, TIPOS } from '../../componentes/tiposPregunta';
import { Boton } from '../../componentes/ui';
import { esDeOpciones, opcionesPorDefecto, type FormularioEditable } from './modelo';

const claseInput =
  'mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-2 focus:outline-indigo-500 aria-invalid:border-red-400';

function MensajeError({ id, mensaje }: { id: string; mensaje?: string }) {
  return mensaje ? (
    <p id={id} className="mt-1 text-sm text-red-600">
      {mensaje}
    </p>
  ) : null;
}

interface Props {
  indice: number;
  total: number;
  /** Clave estable de la tarjeta (de useFieldArray): no cambia al reordenar. */
  clave: string;
  /** En un formulario publicado, una pregunta ya guardada no puede cambiar de tipo (regla del dominio). */
  tipoBloqueado: boolean;
  alSubir: () => void;
  alBajar: () => void;
  alEliminar: () => void;
}

export function TarjetaPregunta({ indice, total, clave, tipoBloqueado, alSubir, alBajar, alEliminar }: Props) {
  const { register, setValue, getValues, formState } = useFormContext<FormularioEditable>();
  const tipo = useWatch<FormularioEditable, `preguntas.${number}.tipo`>({ name: `preguntas.${indice}.tipo` });
  const errores = formState.errors.preguntas?.[indice];
  const id = (campo: string) => `p-${clave}-${campo}`;

  // Al pasar a un tipo de opciones sin opciones cargadas, se proponen dos por defecto.
  const alCambiarTipo = (nuevo: TipoPregunta) => {
    if (esDeOpciones(nuevo) && getValues(`preguntas.${indice}.opciones`).length === 0) {
      setValue(`preguntas.${indice}.opciones`, opcionesPorDefecto(), { shouldDirty: true });
    }
  };

  return (
    // role="group" + aria-labelledby: los lectores de pantalla anuncian "Pregunta 1, grupo" al entrar.
    <div role="group" aria-labelledby={id('titulo')} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id('titulo')} className="font-semibold text-slate-900">
          Pregunta {indice + 1}
        </h2>
        <div className="flex gap-1">
          <Boton id={`subir-${clave}`} variante="secundario" tamano="chico" onClick={alSubir} disabled={indice === 0} aria-label={`Subir pregunta ${indice + 1}`}>
            ↑
          </Boton>
          <Boton id={`bajar-${clave}`} variante="secundario" tamano="chico" onClick={alBajar} disabled={indice === total - 1} aria-label={`Bajar pregunta ${indice + 1}`}>
            ↓
          </Boton>
          <Boton variante="secundario" tamano="chico" className="text-red-700" onClick={alEliminar} aria-label={`Eliminar pregunta ${indice + 1}`}>
            Eliminar
          </Boton>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[12rem_1fr]">
        <div>
          <label htmlFor={id('tipo')} className="block text-sm font-medium text-slate-700">
            Tipo
          </label>
          <select
            id={id('tipo')}
            disabled={tipoBloqueado}
            aria-describedby={tipoBloqueado ? id('tipo-nota') : undefined}
            className={claseInput}
            {...register(`preguntas.${indice}.tipo`, { onChange: (e) => alCambiarTipo(e.target.value) })}
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {NOMBRE_TIPO[t]}
              </option>
            ))}
          </select>
          {tipoBloqueado && (
            <p id={id('tipo-nota')} className="mt-1 text-xs text-slate-500">
              Ya publicada: no puede cambiar de tipo. Para otro tipo, agrega una pregunta nueva.
            </p>
          )}
        </div>
        <div>
          <label htmlFor={id('texto')} className="block text-sm font-medium text-slate-700">
            Pregunta
          </label>
          <input
            id={id('texto')}
            className={claseInput}
            placeholder="Escribe la pregunta"
            aria-invalid={errores?.texto ? true : undefined}
            aria-describedby={errores?.texto ? id('texto-error') : undefined}
            {...register(`preguntas.${indice}.texto`)}
          />
          <MensajeError id={id('texto-error')} mensaje={errores?.texto?.message} />
        </div>
      </div>

      <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="size-4 rounded border-slate-300" {...register(`preguntas.${indice}.obligatoria`)} />
        Obligatoria
      </label>

      {esDeOpciones(tipo) && <EditorOpciones indice={indice} clave={clave} />}

      {tipo === 'escala' && (
        <div className="mt-4 grid max-w-xs grid-cols-2 gap-4">
          <div>
            <label htmlFor={id('minimo')} className="block text-sm font-medium text-slate-700">
              Mínimo
            </label>
            <input
              id={id('minimo')}
              type="number"
              min={0}
              max={10}
              className={claseInput}
              aria-invalid={errores?.minimo ? true : undefined}
              aria-describedby={errores?.minimo ? id('minimo-error') : undefined}
              {...register(`preguntas.${indice}.minimo`, { valueAsNumber: true })}
            />
          </div>
          <div>
            <label htmlFor={id('maximo')} className="block text-sm font-medium text-slate-700">
              Máximo
            </label>
            <input
              id={id('maximo')}
              type="number"
              min={0}
              max={10}
              className={claseInput}
              aria-invalid={errores?.maximo ? true : undefined}
              {...register(`preguntas.${indice}.maximo`, { valueAsNumber: true })}
            />
          </div>
          <div className="col-span-2">
            <MensajeError id={id('minimo-error')} mensaje={errores?.minimo?.message ?? errores?.maximo?.message} />
          </div>
        </div>
      )}
    </div>
  );
}

function EditorOpciones({ indice, clave }: { indice: number; clave: string }) {
  const { register, formState } = useFormContext<FormularioEditable>();
  const { fields, append, remove } = useFieldArray<FormularioEditable, `preguntas.${number}.opciones`>({
    name: `preguntas.${indice}.opciones`,
  });
  const errores = formState.errors.preguntas?.[indice]?.opciones;
  const idError = `p-${clave}-opciones-error`;

  return (
    <div className="mt-4" role="group" aria-label={`Opciones de la pregunta ${indice + 1}`} aria-describedby={errores?.root ? idError : undefined}>
      <p className="text-sm font-medium text-slate-700">Opciones</p>
      <ul className="mt-2 space-y-2">
        {fields.map((opcion, j) => (
          <li key={opcion.id}>
            <div className="flex gap-2">
              <input
                aria-label={`Opción ${j + 1}`}
                className="block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:outline-2 focus:outline-indigo-500 aria-invalid:border-red-400"
                aria-invalid={errores?.[j]?.texto ? true : undefined}
                {...register(`preguntas.${indice}.opciones.${j}.texto`)}
              />
              <Boton variante="secundario" tamano="chico" onClick={() => remove(j)} aria-label={`Quitar opción ${j + 1}`}>
                ×
              </Boton>
            </div>
            <MensajeError id={`p-${clave}-opcion-${j}-error`} mensaje={errores?.[j]?.texto?.message} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-2 text-sm font-medium text-indigo-600 hover:underline"
        onClick={() =>
          append({ texto: `Opción ${fields.length + 1}` }, { focusName: `preguntas.${indice}.opciones.${fields.length}.texto` })
        }
      >
        + Agregar opción
      </button>
      <MensajeError id={idError} mensaje={errores?.root?.message} />
    </div>
  );
}
