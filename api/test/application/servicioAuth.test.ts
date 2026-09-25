import { describe, expect, it } from 'vitest';
import { ServicioAuth } from '../../src/application/servicioAuth.js';
import { RepositorioUsuariosEnMemoria } from '../dobles/repositorioUsuariosEnMemoria.js';
import { HasheadorFalso, TokensFalsos } from '../dobles/seguridadFalsa.js';

function crearServicio() {
  const repo = new RepositorioUsuariosEnMemoria();
  const hasheador = new HasheadorFalso();
  const servicio = new ServicioAuth(repo, hasheador, new TokensFalsos());
  return { servicio, repo, hasheador };
}

const datosAna = { nombre: '  Ana  ', email: ' Ana@Correo.CL ', password: 'secreta123' };

describe('ServicioAuth.registrar', () => {
  it('guarda el hash (nunca la contraseña), normaliza nombre y email y devuelve un token', async () => {
    const { servicio, repo } = crearServicio();

    const resultado = await servicio.registrar(datosAna);

    expect(repo.usuarios[0]).toMatchObject({ nombre: 'Ana', email: 'ana@correo.cl', passwordHash: 'hash:secreta123' });
    expect(resultado.token).toBe('token-1');
    expect(resultado.usuario).toMatchObject({ id: 1, nombre: 'Ana', email: 'ana@correo.cl' });
    expect(resultado.usuario).not.toHaveProperty('passwordHash');
  });

  it('rechaza un email ya registrado aunque cambien mayúsculas', async () => {
    const { servicio } = crearServicio();
    await servicio.registrar(datosAna);

    await expect(servicio.registrar({ ...datosAna, email: 'ANA@correo.cl' })).rejects.toMatchObject({
      tipo: 'conflicto',
    });
  });
});

describe('ServicioAuth.login', () => {
  it('devuelve usuario y token con credenciales correctas', async () => {
    const { servicio } = crearServicio();
    await servicio.registrar(datosAna);

    const resultado = await servicio.login({ email: 'ANA@correo.cl', password: 'secreta123' });

    expect(resultado.token).toBe('token-1');
    expect(resultado.usuario.email).toBe('ana@correo.cl');
  });

  it('rechaza una contraseña incorrecta', async () => {
    const { servicio } = crearServicio();
    await servicio.registrar(datosAna);

    await expect(servicio.login({ email: 'ana@correo.cl', password: 'otra' })).rejects.toMatchObject({
      tipo: 'no_autorizado',
      message: 'Credenciales inválidas',
    });
  });

  it('rechaza un email inexistente con el mismo mensaje y hasheando igual (evita enumerar usuarios)', async () => {
    const { servicio, hasheador } = crearServicio();

    await expect(servicio.login({ email: 'nadie@correo.cl', password: 'x' })).rejects.toMatchObject({
      tipo: 'no_autorizado',
      message: 'Credenciales inválidas',
    });
    expect(hasheador.llamadasHashear).toBe(1);
  });
});

describe('ServicioAuth.obtenerPerfil', () => {
  it('lanza no_encontrado si el usuario ya no existe', async () => {
    const { servicio } = crearServicio();

    await expect(servicio.obtenerPerfil(99)).rejects.toMatchObject({ tipo: 'no_encontrado' });
  });
});
