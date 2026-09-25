import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { ModeloFormulario, ModeloRespuesta } from '../../src/infrastructure/mongo/modelos.js';

/**
 * Levanta un MongoDB real en memoria para el archivo de pruebas que lo llame, y deja las
 * colecciones vacías antes de cada prueba. Los índices se crean igual que en producción.
 */
export function usarMongoEnMemoria(): void {
  let servidor: MongoMemoryServer;

  beforeAll(async () => {
    servidor = await MongoMemoryServer.create();
    await mongoose.connect(servidor.getUri('formalista-pruebas'));
    await Promise.all([ModeloFormulario.syncIndexes(), ModeloRespuesta.syncIndexes()]);
  });

  beforeEach(async () => {
    await Promise.all([ModeloFormulario.deleteMany({}), ModeloRespuesta.deleteMany({})]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await servidor?.stop();
  });
}
