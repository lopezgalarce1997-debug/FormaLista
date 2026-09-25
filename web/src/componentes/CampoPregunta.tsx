import type { Pregunta } from '@formalista/compartido';
import { useId } from 'react';

interface Props {
  pregunta: Pregunta;
  /** Valor actual: texto, fecha "AAAA-MM-DD", número (escala) o lista de textos (opción múltiple). */
  valor: unknown;
  alCambiar: (valor: unknown) => void;
  error?: string;
}

const claseInput =
  'mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-2 focus:outline-indigo-500 aria-invalid:border-red-400';

/**
 * Una pregunta tal como la ve quien responde. Se usa en la vista previa del editor y en la
 * página pública (pantalla 4). Los valores que produce son los que valida el dominio
 * (validarRespuestas): así la vista previa se comporta igual que el formulario real.
 */
export function CampoPregunta({ pregunta, valor, alCambiar, error }: Props) {
  const id = useId();
  const idTitulo = `${id}-titulo`;
  const idError = `${id}-error`;
  const aria = {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? idError : undefined,
  } as const;

  const titulo = (
    <>
      {pregunta.texto}
      {pregunta.obligatoria && (
        <span className="text-red-600" aria-hidden>
          {' '}
          *
        </span>
      )}
    </>
  );
  const mensajeError = error ? (
    <p id={idError} className="mt-2 text-sm text-red-600">
      {error}
    </p>
  ) : null;

  switch (pregunta.tipo) {
    case 'texto_corto':
    case 'texto_largo':
    case 'fecha': {
      const comunes = {
        id,
        className: claseInput,
        'aria-required': pregunta.obligatoria,
        value: typeof valor === 'string' ? valor : '',
        ...aria,
      };
      return (
        <div>
          <label htmlFor={id} className="block font-medium text-slate-900">
            {titulo}
          </label>
          {pregunta.tipo === 'texto_largo' ? (
            <textarea rows={4} {...comunes} onChange={(e) => alCambiar(e.target.value)} />
          ) : (
            <input type={pregunta.tipo === 'fecha' ? 'date' : 'text'} {...comunes} onChange={(e) => alCambiar(e.target.value)} />
          )}
          {mensajeError}
        </div>
      );
    }

    case 'opcion_unica':
    case 'opcion_multiple': {
      const multiple = pregunta.tipo === 'opcion_multiple';
      const elegidas = Array.isArray(valor) ? (valor as string[]) : [];
      const cambiar = (opcion: string, marcada: boolean) => {
        if (!multiple) return alCambiar(opcion);
        // Se mantiene el orden del formulario (igual que al guardar la respuesta).
        const nuevas = marcada ? [...elegidas, opcion] : elegidas.filter((o) => o !== opcion);
        alCambiar(pregunta.opciones.filter((o) => nuevas.includes(o)));
      };
      return (
        <div role={multiple ? 'group' : 'radiogroup'} aria-labelledby={idTitulo} aria-required={pregunta.obligatoria} {...aria}>
          <p id={idTitulo} className="font-medium text-slate-900">
            {titulo}
          </p>
          <div className="mt-2 space-y-2">
            {pregunta.opciones.map((opcion) => (
              <label key={opcion} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  name={id}
                  className="size-4 border-slate-300 text-indigo-600"
                  checked={multiple ? elegidas.includes(opcion) : valor === opcion}
                  onChange={(e) => cambiar(opcion, e.target.checked)}
                />
                {opcion}
              </label>
            ))}
          </div>
          {mensajeError}
        </div>
      );
    }

    case 'escala': {
      // En la vista previa el rango puede estar a medio escribir (vacío o invertido): no se dibuja.
      const rangoValido = Number.isInteger(pregunta.minimo) && Number.isInteger(pregunta.maximo) && pregunta.minimo < pregunta.maximo;
      const valores = rangoValido
        ? Array.from({ length: pregunta.maximo - pregunta.minimo + 1 }, (_, i) => pregunta.minimo + i)
        : [];
      return (
        <div role="radiogroup" aria-labelledby={idTitulo} aria-required={pregunta.obligatoria} {...aria}>
          <p id={idTitulo} className="font-medium text-slate-900">
            {titulo}
          </p>
          {!rangoValido && <p className="mt-2 text-sm text-slate-500">El rango de la escala no es válido todavía.</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {valores.map((n) => (
              // El radio real queda oculto a la vista pero accesible (teclado y lectores de pantalla).
              <label
                key={n}
                className="flex size-10 cursor-pointer items-center justify-center rounded-md text-sm font-medium ring-1 ring-slate-300 has-checked:bg-indigo-600 has-checked:text-white has-checked:ring-indigo-600 has-focus-visible:outline-2 has-focus-visible:outline-indigo-500"
              >
                <input type="radio" name={id} className="sr-only" checked={valor === n} onChange={() => alCambiar(n)} />
                {n}
              </label>
            ))}
          </div>
          {mensajeError}
        </div>
      );
    }
  }
}
