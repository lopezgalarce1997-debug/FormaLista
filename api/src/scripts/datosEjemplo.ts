// Uso: npm run datos-ejemplo
// Crea (o vuelve a crear) una cuenta de demostración con formularios, respuestas y un equipo.
// Pasa por los servicios de la aplicación: se aplican las mismas validaciones, versionado y
// permisos que en la API. Solo borra los datos de las cuentas de demostración (emails de abajo).
import {
  esquemaActualizacion,
  esquemaFormulario,
  esquemaRegistro,
  type FormularioDetalle,
  type ValorRespuesta,
} from '@formalista/compartido';
import mongoose from 'mongoose';
import type { RowDataPacket } from 'mysql2';
import { ServicioAuth } from '../application/servicioAuth.js';
import { ServicioEquipos } from '../application/servicioEquipos.js';
import { ServicioFormularios } from '../application/servicioFormularios.js';
import { ServicioPublico } from '../application/servicioPublico.js';
import { cargarArchivoEnv, cargarConfig } from '../config/env.js';
import { conectarMongo } from '../infrastructure/mongo/conexion.js';
import { ModeloFormulario, ModeloRespuesta } from '../infrastructure/mongo/modelos.js';
import { RepositorioFormulariosMongo } from '../infrastructure/mongo/repositorioFormulariosMongo.js';
import { RepositorioRespuestasMongo } from '../infrastructure/mongo/repositorioRespuestasMongo.js';
import { crearPoolMySql } from '../infrastructure/mysql/pool.js';
import { RepositorioEquiposMySql } from '../infrastructure/mysql/repositorioEquiposMySql.js';
import { RepositorioRegistroFormulariosMySql } from '../infrastructure/mysql/repositorioRegistroFormulariosMySql.js';
import { RepositorioUsuariosMySql } from '../infrastructure/mysql/repositorioUsuariosMySql.js';
import { HasheadorBcrypt } from '../infrastructure/seguridad/hasheadorBcrypt.js';
import { ServicioTokensJwt } from '../infrastructure/seguridad/servicioTokensJwt.js';

const PASSWORD = 'demo12345';
// Dominio reservado para ejemplos (RFC 2606): nunca pertenece a una persona real.
const CUENTAS = {
  valentina: { nombre: 'Valentina Pérez', email: 'demo@example.com' },
  camila: { nombre: 'Camila Rojas', email: 'camila.rojas@example.com' },
  diego: { nombre: 'Diego Muñoz', email: 'diego.munoz@example.com' },
} as const;
const EMAILS = Object.values(CUENTAS).map((c) => c.email);

cargarArchivoEnv();
const config = cargarConfig();
if (config.entorno === 'production') throw new Error('Los datos de ejemplo no se cargan en producción');

const pool = crearPoolMySql(config.mysql);
await conectarMongo(config.mongoUri);

const repoUsuarios = new RepositorioUsuariosMySql(pool);
const repoEquipos = new RepositorioEquiposMySql(pool);
const repoRegistro = new RepositorioRegistroFormulariosMySql(pool);
const repoFormularios = new RepositorioFormulariosMongo();
const repoRespuestas = new RepositorioRespuestasMongo();
const auth = new ServicioAuth(repoUsuarios, new HasheadorBcrypt(), new ServicioTokensJwt(config.jwt.secreto, '1m'));
const formularios = new ServicioFormularios(repoRegistro, repoFormularios, repoRespuestas, repoEquipos, console);
const publico = new ServicioPublico(repoRegistro, repoFormularios, repoRespuestas);
const equipos = new ServicioEquipos(repoEquipos, repoUsuarios);

// ---------------------------------------------------------------------------
// Utilidades: azar reproducible (mismos datos en cada ejecución) y fechas relativas a hoy
// ---------------------------------------------------------------------------

/** Generador pseudoaleatorio con semilla (mulberry32): mismas respuestas en cada ejecución. */
function crearAzar(semilla: number): () => number {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = crearAzar(2026);
const entero = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1));
const unoDe = <T>(lista: readonly T[]): T => lista[Math.floor(azar() * lista.length)]!;
/** Elige según pesos: ponderado(['a', 'b'], [3, 1]) devuelve 'a' tres veces más que 'b'. */
function ponderado<T>(lista: readonly T[], pesos: readonly number[]): T {
  let r = azar() * pesos.reduce((s, p) => s + p, 0);
  for (let i = 0; i < lista.length; i++) if ((r -= pesos[i]!) < 0) return lista[i]!;
  return lista.at(-1)!;
}
/** Subconjunto al azar (cada opción con su probabilidad), con al menos una. */
function algunos(lista: readonly string[], probabilidad: number): string[] {
  const elegidas = lista.filter(() => azar() < probabilidad);
  return elegidas.length > 0 ? elegidas : [unoDe(lista)];
}

/** Un instante de hace `dias` días, en horario de 9:00 a 20:59 (hoy: siempre en el pasado). */
function haceDias(dias: number): Date {
  const fecha = new Date();
  if (dias === 0) return new Date(fecha.getTime() - entero(5, 180) * 60_000);
  fecha.setDate(fecha.getDate() - dias);
  fecha.setHours(entero(9, 20), entero(0, 59), entero(0, 59), 0);
  return fecha;
}
/** Fecha local "AAAA-MM-DD". */
const aaaammdd = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

/** Borra lo creado por una ejecución anterior: solo cuentas de demostración y lo que les pertenece. */
async function borrarDemoAnterior(): Promise<void> {
  const [usuarios] = await pool.query<RowDataPacket[]>('SELECT id FROM usuarios WHERE email IN (?)', [EMAILS]);
  const ids = usuarios.map((u) => u.id as number);
  if (ids.length === 0) return;

  // Formularios: por el servicio, que también borra sus respuestas en MongoDB.
  const [propios] = await pool.query<RowDataPacket[]>(
    'SELECT id_mongo, propietario_id FROM formularios_registro WHERE propietario_id IN (?)',
    [ids],
  );
  for (const f of propios) await formularios.eliminar(f.propietario_id as number, f.id_mongo as string);

  // Equipos en los que SOLO hay cuentas de demostración (si alguien real se unió, el equipo queda).
  await pool.query(
    `DELETE FROM equipos
      WHERE id IN (SELECT equipo_id FROM equipo_miembros WHERE usuario_id IN (?))
        AND id NOT IN (SELECT equipo_id FROM equipo_miembros WHERE usuario_id NOT IN (?))`,
    [ids, ids],
  );
  await pool.query('DELETE FROM usuarios WHERE id IN (?)', [ids]);
}

async function crearCuenta(cuenta: { nombre: string; email: string }): Promise<number> {
  const { usuario } = await auth.registrar(esquemaRegistro.parse({ ...cuenta, password: PASSWORD }));
  return usuario.id;
}

async function crearFormulario(usuarioId: number, datos: unknown): Promise<FormularioDetalle> {
  return formularios.crear(usuarioId, esquemaFormulario.parse(datos));
}

/** Responde por el caso de uso público (validación incluida) y ajusta la fecha de envío. */
async function responder(formulario: FormularioDetalle, enviadaEn: Date, respuestas: Record<string, ValorRespuesta>) {
  const { id } = await publico.responder(formulario.slug, respuestas, formulario.version);
  // La fecha es lo único que se fija por fuera del servicio: al responder siempre es "ahora", y
  // para que los gráficos por día tengan forma las respuestas se reparten en las últimas semanas.
  await ModeloRespuesta.updateOne({ _id: id }, { enviadaEn });
}

/** Que el listado muestre fechas de creación y edición creíbles, no "hace unos segundos". */
async function fecharFormulario(id: string, creadoHaceDias: number, actualizadoHaceDias: number) {
  await ModeloFormulario.updateOne(
    { _id: id },
    { $set: { creadoEn: haceDias(creadoHaceDias), actualizadoEn: haceDias(actualizadoHaceDias) } },
    { timestamps: false },
  );
}

const MEJORAS = [
  'Más opciones sin lactosa.',
  'La fila en la hora de almuerzo es muy larga.',
  'Todo excelente, el personal es muy amable.',
  'Me gustaría que abrieran más temprano.',
  'Los precios subieron bastante este mes.',
  'Faltan enchufes para trabajar con el computador.',
  'El café estaba frío.',
  'Muy buena atención, volveré pronto.',
  'Podrían aceptar pago con QR.',
  'La música estaba un poco fuerte.',
];

/** Encuesta publicada con dos versiones: la 2 agrega y quita opciones y cambia el rango de la escala. */
async function encuestaCafeteria(valentina: number, equipoId: number): Promise<void> {
  const preguntasV1 = [
    { tipo: 'opcion_unica', texto: '¿Con qué frecuencia nos visitas?', obligatoria: true, opciones: ['Primera vez', 'Una vez al mes', 'Una vez a la semana', 'Casi todos los días'] },
    { tipo: 'escala', texto: '¿Qué tan satisfecho quedaste con la atención?', obligatoria: true, minimo: 1, maximo: 5 },
    { tipo: 'opcion_multiple', texto: '¿Qué pediste hoy?', opciones: ['Café', 'Té', 'Pastelería', 'Sándwich', 'Jugo natural'] },
    { tipo: 'fecha', texto: '¿Qué día nos visitaste?' },
    { tipo: 'texto_largo', texto: '¿Qué podríamos mejorar?' },
  ];
  let f = await crearFormulario(valentina, {
    titulo: 'Encuesta de satisfacción – Cafetería Central',
    descripcion: 'Tu opinión nos ayuda a mejorar. Responder toma menos de un minuto.',
    preguntas: preguntasV1,
  });
  f = await formularios.publicar(valentina, f.id);
  const [frecuencia, satisfaccion, pedido, dia, mejora] = f.preguntas.map((p) => p.id);

  for (let i = 0; i < 38; i++) {
    const enviadaEn = haceDias(entero(7, 20));
    await responder(f, enviadaEn, {
      [frecuencia!]: ponderado(['Primera vez', 'Una vez al mes', 'Una vez a la semana', 'Casi todos los días'], [2, 3, 4, 2]),
      [satisfaccion!]: ponderado([1, 2, 3, 4, 5], [1, 1, 3, 6, 5]),
      [pedido!]: algunos(['Café', 'Té', 'Pastelería', 'Sándwich', 'Jugo natural'], 0.35),
      [dia!]: aaaammdd(enviadaEn),
      ...(azar() < 0.4 && { [mejora!]: unoDe(MEJORAS) }),
    });
  }

  // Versión 2: se quita "Jugo natural", se agrega "Opción vegana" y la escala pasa a 1–10.
  const v2 = f.preguntas.map((p) => {
    if (p.id === pedido && p.tipo === 'opcion_multiple') return { ...p, opciones: ['Café', 'Té', 'Pastelería', 'Sándwich', 'Opción vegana'] };
    if (p.id === satisfaccion && p.tipo === 'escala') return { ...p, maximo: 10 };
    return p;
  });
  f = await formularios.actualizar(valentina, f.id, esquemaActualizacion.parse({ titulo: f.titulo, descripcion: f.descripcion, preguntas: v2, version: f.version }));

  for (let i = 0; i < 26; i++) {
    const enviadaEn = haceDias(entero(0, 6));
    await responder(f, enviadaEn, {
      [frecuencia!]: ponderado(['Primera vez', 'Una vez al mes', 'Una vez a la semana', 'Casi todos los días'], [3, 3, 4, 3]),
      [satisfaccion!]: ponderado([5, 6, 7, 8, 9, 10], [1, 1, 3, 5, 5, 3]),
      [pedido!]: algunos(['Café', 'Té', 'Pastelería', 'Sándwich', 'Opción vegana'], 0.35),
      [dia!]: aaaammdd(enviadaEn),
      ...(azar() < 0.4 && { [mejora!]: unoDe(MEJORAS) }),
    });
  }

  await formularios.compartir(valentina, f.id, equipoId);
  await fecharFormulario(f.id, 21, 6);
}

/** De otra persona del equipo: a Valentina le aparece como "Compartido". */
async function inscripcionTaller(camila: number, equipoId: number): Promise<void> {
  let f = await crearFormulario(camila, {
    titulo: 'Inscripción Taller de React – Octubre',
    descripcion: 'Cupos limitados. Te confirmaremos por correo.',
    preguntas: [
      { tipo: 'texto_corto', texto: 'Nombre completo', obligatoria: true },
      { tipo: 'texto_corto', texto: 'Correo de contacto', obligatoria: true },
      { tipo: 'opcion_unica', texto: '¿Cuál es tu nivel de JavaScript?', obligatoria: true, opciones: ['Principiante', 'Intermedio', 'Avanzado'] },
      { tipo: 'opcion_multiple', texto: '¿Qué temas te interesan?', opciones: ['Hooks', 'Formularios', 'Pruebas', 'Rendimiento', 'Accesibilidad'] },
      { tipo: 'fecha', texto: 'Fecha preferida para la primera sesión', obligatoria: true },
    ],
  });
  f = await formularios.publicar(camila, f.id);
  const [nombre, correo, nivel, temas, fecha] = f.preguntas.map((p) => p.id);
  const nombres = ['Josefa', 'Matías', 'Florencia', 'Benjamín', 'Antonia', 'Tomás', 'Isidora', 'Vicente', 'Martina', 'Joaquín', 'Catalina', 'Agustín'];
  const apellidos = ['González', 'Silva', 'Contreras', 'Sepúlveda', 'Morales', 'Fuentes', 'Castillo', 'Araya', 'Espinoza', 'Reyes'];

  for (let i = 0; i < 18; i++) {
    const [n, a] = [unoDe(nombres), unoDe(apellidos)];
    const correoPersona = `${n}.${a}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    await responder(f, haceDias(entero(0, 12)), {
      [nombre!]: `${n} ${a}`,
      [correo!]: `${correoPersona}@correo.example`,
      [nivel!]: ponderado(['Principiante', 'Intermedio', 'Avanzado'], [3, 5, 2]),
      [temas!]: algunos(['Hooks', 'Formularios', 'Pruebas', 'Rendimiento', 'Accesibilidad'], 0.45),
      [fecha!]: ponderado(['2026-10-06', '2026-10-13', '2026-10-20'], [5, 3, 2]),
    });
  }

  await formularios.compartir(camila, f.id, equipoId);
  await fecharFormulario(f.id, 13, 13);
}

/** Encuesta que ya terminó: publicada, respondida y cerrada. */
async function climaLaboral(valentina: number): Promise<void> {
  let f = await crearFormulario(valentina, {
    titulo: 'Clima laboral – Tercer trimestre',
    descripcion: 'Encuesta anónima para todo el equipo.',
    preguntas: [
      { tipo: 'escala', texto: '¿Cómo evalúas el ambiente de trabajo?', obligatoria: true, minimo: 1, maximo: 5 },
      { tipo: 'opcion_unica', texto: '¿Recomendarías la empresa a un amigo?', obligatoria: true, opciones: ['Sí', 'No', 'No estoy seguro'] },
      { tipo: 'opcion_multiple', texto: '¿Qué aspectos valoras más?', opciones: ['Flexibilidad horaria', 'Equipo', 'Beneficios', 'Aprendizaje', 'Remuneración'] },
      { tipo: 'texto_largo', texto: 'Comentarios' },
    ],
  });
  f = await formularios.publicar(valentina, f.id);
  const [ambiente, recomendaria, aspectos, comentarios] = f.preguntas.map((p) => p.id);
  const textos = ['Buen equipo, pero mucha carga en cierre de mes.', 'Me gustaría más capacitación.', 'La flexibilidad horaria es lo mejor.', 'Falta comunicación entre áreas.'];

  for (let i = 0; i < 14; i++) {
    await responder(f, haceDias(entero(22, 35)), {
      [ambiente!]: ponderado([1, 2, 3, 4, 5], [0, 1, 3, 6, 4]),
      [recomendaria!]: ponderado(['Sí', 'No', 'No estoy seguro'], [8, 1, 3]),
      [aspectos!]: algunos(['Flexibilidad horaria', 'Equipo', 'Beneficios', 'Aprendizaje', 'Remuneración'], 0.4),
      ...(azar() < 0.5 && { [comentarios!]: unoDe(textos) }),
    });
  }

  await formularios.cerrar(valentina, f.id);
  await fecharFormulario(f.id, 36, 21);
}

async function evaluacionProveedores(valentina: number): Promise<void> {
  const f = await crearFormulario(valentina, {
    titulo: 'Evaluación de proveedores 2026',
    preguntas: [
      { tipo: 'texto_corto', texto: 'Nombre del proveedor', obligatoria: true },
      { tipo: 'escala', texto: 'Cumplimiento de plazos', obligatoria: true, minimo: 1, maximo: 5 },
      { tipo: 'escala', texto: 'Calidad del producto', obligatoria: true, minimo: 1, maximo: 5 },
      { tipo: 'texto_largo', texto: 'Observaciones' },
    ],
  });
  await fecharFormulario(f.id, 2, 0);
}

// ---------------------------------------------------------------------------

try {
  await borrarDemoAnterior();

  const valentina = await crearCuenta(CUENTAS.valentina);
  const camila = await crearCuenta(CUENTAS.camila);
  await crearCuenta(CUENTAS.diego);

  const equipo = await equipos.crear(valentina, 'Experiencia de clientes');
  await equipos.agregarMiembro(valentina, equipo.id, CUENTAS.camila.email, 'editor');
  await equipos.agregarMiembro(valentina, equipo.id, CUENTAS.diego.email, 'lector');

  await encuestaCafeteria(valentina, equipo.id);
  await inscripcionTaller(camila, equipo.id);
  await climaLaboral(valentina);
  await evaluacionProveedores(valentina);

  console.log('Datos de ejemplo listos. Inicia sesión con:');
  for (const cuenta of Object.values(CUENTAS)) console.log(`  ${cuenta.email.padEnd(26)} ${PASSWORD}  (${cuenta.nombre})`);
} finally {
  await Promise.allSettled([pool.end(), mongoose.disconnect()]);
}
