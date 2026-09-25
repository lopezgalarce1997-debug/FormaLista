import mongoose, { type Connection } from 'mongoose';

export async function conectarMongo(uri: string): Promise<Connection> {
  // Si MongoDB no responde en 5 s, falla en vez de quedarse esperando indefinidamente.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

export async function pingMongo(conexion: Connection): Promise<void> {
  if (!conexion.db) throw new Error('MongoDB no está conectado');
  await conexion.db.admin().ping();
}
