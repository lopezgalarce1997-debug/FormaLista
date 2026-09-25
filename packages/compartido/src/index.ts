// Código compartido entre la API y la web: dominio puro (sin dependencias de infraestructura)
// y esquemas de entrada. Todo aquí debe funcionar igual en Node y en el navegador.
export * from './dominio/estadisticas.js';
export * from './dominio/formulario.js';
export * from './dominio/permisos.js';
export * from './dominio/respuesta.js';
export * from './dominio/usuario.js';
export * from './esquemas.js';
export * from './serializado.js';
