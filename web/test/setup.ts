import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { servidor } from './servidor';

// jsdom no implementa <dialog>.showModal()/close(). Polyfill mínimo con lo que usa Dialogo.tsx:
// el atributo `open` y el evento `close` (que en el navegador dispara Esc o close()).
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

// MSW intercepta fetch y responde como la API. 'error': una petición sin handler hace fallar la
// prueba (así no se nos escapa una llamada que no esperábamos).
beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  servidor.resetHandlers();
});
afterAll(() => servidor.close());
