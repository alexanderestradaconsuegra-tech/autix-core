import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createPool } from './db.js';
import { buildConnectorServer } from './server.js';

describe('Campolac Connector — GET /healthz + POST /invoke (contra Postgres real)', () => {
  const pool: Pool = createPool();
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildConnectorServer(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('GET /healthz reports ok when Postgres is reachable', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('POST /invoke campolac.productos.consultar devuelve productos reales', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/invoke',
      payload: {
        toolId: 'campolac.productos.consultar',
        input: { producto: 'queso' },
        context: { tenantId: 'campolac', traceId: 'trace-1' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; output?: { productos: unknown[] } }>();
    expect(body.success).toBe(true);
    expect(body.output?.productos).toHaveLength(3);
  });

  it('devuelve NOT_FOUND (200 + success:false) para una Tool que este Connector no implementa', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/invoke',
      payload: {
        toolId: 'campolac.ventas.registrar',
        input: {},
        context: { tenantId: 'campolac', traceId: 'trace-1' },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('devuelve VALIDATION_ERROR (200 + success:false) cuando falta "producto" en el input', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/invoke',
      payload: {
        toolId: 'campolac.productos.consultar',
        input: {},
        context: { tenantId: 'campolac', traceId: 'trace-1' },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });
});
