import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { toTenantId, toToolId } from '@autix/contracts';

import { HttpConnectorClient } from './http-connector-client.js';
import type { ConnectorInvokeRequest } from './connector-port.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server | undefined;

async function startServer(handler: Handler): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('No se pudo obtener el puerto del servidor de prueba.');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
});

const SAMPLE_REQUEST: ConnectorInvokeRequest = {
  toolId: toToolId('campolac.productos.consultar'),
  input: { nombre: 'queso' },
  context: { tenantId: toTenantId('campolac'), traceId: 'trace-1' },
};

describe('HttpConnectorClient.healthCheck', () => {
  it('returns the status the Connector reports on 2xx', async () => {
    const baseUrl = await startServer((_req, res) => sendJson(res, 200, { status: 'ok' }));
    const client = new HttpConnectorClient({ baseUrl });

    expect(await client.healthCheck()).toEqual({ status: 'ok' });
  });

  it('treats a non-2xx response as down', async () => {
    const baseUrl = await startServer((_req, res) => sendJson(res, 500, { oops: true }));
    const client = new HttpConnectorClient({ baseUrl });

    const result = await client.healthCheck();
    expect(result.status).toBe('down');
    expect(result.message).toMatch(/500/);
  });

  it('treats an unreachable Connector as down, never throws', async () => {
    // nada escuchando en este puerto
    const client = new HttpConnectorClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 });

    const result = await client.healthCheck();
    expect(result.status).toBe('down');
  });

  it('treats a malformed body as down', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('not json');
    });
    const client = new HttpConnectorClient({ baseUrl });

    expect((await client.healthCheck()).status).toBe('down');
  });
});

describe('HttpConnectorClient.invoke', () => {
  it('passes the request through as JSON and returns a successful result verbatim', async () => {
    let receivedBody = '';
    const baseUrl = await startServer((req, res) => {
      void (async () => {
        receivedBody = await readBody(req);
        sendJson(res, 200, { success: true, output: { precio: 4200 } });
      })();
    });
    const client = new HttpConnectorClient({ baseUrl });

    const result = await client.invoke(SAMPLE_REQUEST);

    expect(result).toEqual({ success: true, output: { precio: 4200 } });
    expect(JSON.parse(receivedBody)).toEqual(SAMPLE_REQUEST);
  });

  it('passes a business error through verbatim (CONNECTOR_ERROR is never invented here)', async () => {
    const baseUrl = await startServer((_req, res) =>
      sendJson(res, 200, {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' },
      }),
    );
    const client = new HttpConnectorClient({ baseUrl });

    const result = await client.invoke(SAMPLE_REQUEST);

    expect(result).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' },
    });
  });

  it('reports CONNECTOR_UNAVAILABLE on a non-2xx status', async () => {
    const baseUrl = await startServer((_req, res) => sendJson(res, 503, {}));
    const client = new HttpConnectorClient({ baseUrl });

    const result = await client.invoke(SAMPLE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONNECTOR_UNAVAILABLE');
  });

  it('reports CONNECTOR_UNAVAILABLE when the Connector cannot be reached at all', async () => {
    const client = new HttpConnectorClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 });

    const result = await client.invoke(SAMPLE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONNECTOR_UNAVAILABLE');
  });

  it('reports CONNECTOR_UNAVAILABLE when the Connector does not answer within the timeout', async () => {
    const baseUrl = await startServer((_req, res) => {
      setTimeout(() => sendJson(res, 200, { success: true, output: {} }), 300);
    });
    const client = new HttpConnectorClient({ baseUrl, timeoutMs: 50 });

    const result = await client.invoke(SAMPLE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONNECTOR_UNAVAILABLE');
  });

  it('reports CONNECTOR_ERROR on a body that is not valid JSON', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('not json');
    });
    const client = new HttpConnectorClient({ baseUrl });

    const result = await client.invoke(SAMPLE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONNECTOR_ERROR');
  });

  it('reports CONNECTOR_ERROR on a well-formed JSON body with an unexpected shape', async () => {
    const baseUrl = await startServer((_req, res) => sendJson(res, 200, { ok: true }));
    const client = new HttpConnectorClient({ baseUrl });

    const result = await client.invoke(SAMPLE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONNECTOR_ERROR');
  });
});
