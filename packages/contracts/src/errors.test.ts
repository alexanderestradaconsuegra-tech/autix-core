import { describe, expect, it } from 'vitest';

import { AutixError, isErrorCode } from './errors.js';

describe('AutixError', () => {
  it('behaves like a native Error within a process', () => {
    const error = new AutixError('NOT_FOUND', 'Producto no encontrado.');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AutixError);
    expect(error.message).toBe('Producto no encontrado.');
    expect(error.code).toBe('NOT_FOUND');
  });

  it('serializes to a plain, network-safe shape via toShape()', () => {
    const error = new AutixError('CONFLICT', 'Pedido ya confirmado.', { pedidoId: '123' });

    expect(error.toShape()).toEqual({
      code: 'CONFLICT',
      message: 'Pedido ya confirmado.',
      details: { pedidoId: '123' },
    });
  });

  it('omits `details` from the shape when none were given', () => {
    const error = new AutixError('UNAUTHORIZED', 'Sin credenciales.');

    expect(error.toShape()).toEqual({ code: 'UNAUTHORIZED', message: 'Sin credenciales.' });
    expect('details' in error.toShape()).toBe(false);
  });
});

describe('isErrorCode', () => {
  it('narrows unknown input correctly', () => {
    expect(isErrorCode('APPROVAL_REQUIRED')).toBe(true);
    expect(isErrorCode('NOT_A_REAL_CODE')).toBe(false);
  });
});
