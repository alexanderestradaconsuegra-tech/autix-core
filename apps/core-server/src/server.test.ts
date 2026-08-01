import { createServer, type Server } from 'node:http';

import { toAgentId, toCapabilityId, toConnectorId, toToolId, toWorkflowId } from '@autix/contracts';
import {
  ExecutionEngine,
  InMemoryAuditSink,
  InMemoryConnectorDirectory,
  InMemoryEventBus,
  InMemoryRegistryStore,
  Registry,
  ScopePolicyEngine,
  type ConnectorDirectory,
  type ConnectorInvokeRequest,
  type ConnectorInvokeResult,
  type ConnectorPort,
} from '@autix/core';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildServer } from './server.js';

class FakeConnectorPort implements ConnectorPort {
  constructor(private readonly result: ConnectorInvokeResult) {}

  healthCheck() {
    return Promise.resolve({ status: 'ok' as const });
  }

  invoke(_request: ConnectorInvokeRequest): Promise<ConnectorInvokeResult> {
    return Promise.resolve(this.result);
  }
}

const CONNECTOR_ID = toConnectorId('test-connector');
const TOOL_ID = toToolId('test.echo');

const VALID_PRINCIPAL = {
  principalId: 'user-1',
  tenantId: 'tenant-1',
  grantedScopes: ['test:echo'],
};

interface TestServer {
  readonly app: FastifyInstance;
  readonly registry: Registry;
  readonly connectors: ConnectorDirectory;
}

async function buildTestServerWithRegistry(
  toolResult: ConnectorInvokeResult = { success: true, output: { message: 'hola' } },
): Promise<TestServer> {
  const eventBus = new InMemoryEventBus();
  const registry = new Registry(new InMemoryRegistryStore(), eventBus);
  const connectors = new InMemoryConnectorDirectory();

  await registry.registerConnector({
    connectorId: CONNECTOR_ID,
    version: '1.0.0',
    tools: [
      {
        id: TOOL_ID,
        connectorId: CONNECTOR_ID,
        implementsCapability: toCapabilityId('test.echo'),
        version: '1.0.0',
        inputSchema: z.object({ message: z.string() }),
        outputSchema: z.object({ message: z.string() }),
        riskLevel: 'read',
        requiredScopes: ['test:echo'],
        idempotent: false,
        description: 'Eco de prueba.',
      },
    ],
  });
  connectors.register(CONNECTOR_ID, new FakeConnectorPort(toolResult));

  const executionEngine = new ExecutionEngine({
    registry,
    connectors,
    policyEngine: new ScopePolicyEngine(),
    auditSink: new InMemoryAuditSink(),
    eventBus,
  });

  return { app: buildServer({ registry, connectors, executionEngine }), registry, connectors };
}

async function buildTestServer(
  toolResult: ConnectorInvokeResult = { success: true, output: { message: 'hola' } },
): Promise<FastifyInstance> {
  return (await buildTestServerWithRegistry(toolResult)).app;
}

const NAME_JSON_SCHEMA = {
  type: 'object',
  properties: { nombre: { type: 'string' } },
  required: ['nombre'],
};
const PRICE_JSON_SCHEMA = {
  type: 'object',
  properties: { precio: { type: 'number' } },
  required: ['precio'],
};

function manifestDocumentFixture(baseUrl: string, overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: '1.0',
    connector: { id: 'wire-connector', version: '1.0.0', endpoint: { baseUrl } },
    capabilities: [
      {
        id: 'check_price_and_stock',
        version: '1.0.0',
        description: 'Consulta precio y stock disponible de un producto por nombre.',
        riskLevel: 'read',
        compensable: false,
        canonicalInputSchema: NAME_JSON_SCHEMA,
        canonicalOutputSchema: PRICE_JSON_SCHEMA,
      },
    ],
    tools: [
      {
        id: 'wire-connector.consultar',
        connectorId: 'wire-connector',
        version: '1.0.0',
        implementsCapability: 'check_price_and_stock',
        description: 'Réplica de consultar_precio_stock.',
        riskLevel: 'read',
        requiredScopes: [],
        idempotent: true,
        inputSchema: NAME_JSON_SCHEMA,
        outputSchema: PRICE_JSON_SCHEMA,
      },
    ],
    ...overrides,
  };
}

let fakeConnectorServer: Server | undefined;

async function startFakeConnectorHttpServer(): Promise<string> {
  fakeConnectorServer = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.url === '/invoke' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, output: { precio: 4200 } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => fakeConnectorServer?.listen(0, '127.0.0.1', resolve));
  const address = fakeConnectorServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('No se pudo obtener el puerto del servidor de prueba.');
  }
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (fakeConnectorServer) {
    await new Promise<void>((resolve) => fakeConnectorServer?.close(() => resolve()));
    fakeConnectorServer = undefined;
  }
});

describe('GET /health', () => {
  it('responds 200 ok', async () => {
    const app = await buildTestServer();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /v1/tools/:toolId/invoke', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestServer();
  });

  it('invokes the tool and returns 200 on success', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/tools/test.echo/invoke',
      payload: { input: { message: 'hola' }, principal: VALID_PRINCIPAL },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, output: { message: 'hola' } });
  });

  it('returns 400 when "principal" is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/tools/test.echo/invoke',
      payload: { input: { message: 'hola' } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns 400 when "input" is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/tools/test.echo/invoke',
      payload: { principal: VALID_PRINCIPAL },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns 400 when input fails the tool schema', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/tools/test.echo/invoke',
      payload: { input: { message: 42 }, principal: VALID_PRINCIPAL },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns 403 when the principal is missing a required scope', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/tools/test.echo/invoke',
      payload: {
        input: { message: 'hola' },
        principal: { ...VALID_PRINCIPAL, grantedScopes: [] },
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('returns 404 when the tool does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/tools/does.not.exist/invoke',
      payload: { input: {}, principal: VALID_PRINCIPAL },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('returns 503 when the connector is unavailable', async () => {
    const unavailableApp = await buildTestServer({
      success: false,
      error: { code: 'CONNECTOR_UNAVAILABLE', message: 'no responde' },
    });

    const response = await unavailableApp.inject({
      method: 'POST',
      url: '/v1/tools/test.echo/invoke',
      payload: { input: { message: 'hola' }, principal: VALID_PRINCIPAL },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'CONNECTOR_UNAVAILABLE' },
    });
  });

  it('accepts a request without traceId (the server generates one)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/tools/test.echo/invoke',
      payload: { input: { message: 'hola' }, principal: VALID_PRINCIPAL },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('POST /v1/connectors/register (Sprint 14, Capability Registry)', () => {
  it('registers a Connector by wire manifest and makes its tool invokable end-to-end', async () => {
    const app = await buildTestServer();
    const baseUrl = await startFakeConnectorHttpServer();

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/v1/connectors/register',
      payload: manifestDocumentFixture(baseUrl),
    });

    expect(registerResponse.statusCode).toBe(201);
    expect(registerResponse.json()).toEqual({ success: true });

    const invokeResponse = await app.inject({
      method: 'POST',
      url: '/v1/tools/wire-connector.consultar/invoke',
      payload: { input: { nombre: 'queso' }, principal: VALID_PRINCIPAL },
    });

    expect(invokeResponse.statusCode).toBe(200);
    expect(invokeResponse.json()).toEqual({ success: true, output: { precio: 4200 } });
  });

  it('returns 400 when the document does not have the expected shape', async () => {
    const app = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/connectors/register',
      payload: { notEvenClose: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns 400 for an unsupported protocolVersion', async () => {
    const app = await buildTestServer();
    const baseUrl = await startFakeConnectorHttpServer();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/connectors/register',
      payload: manifestDocumentFixture(baseUrl, { protocolVersion: '99.0' }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns 409 when a capability@version is already registered by another Connector', async () => {
    const app = await buildTestServer();
    const baseUrl = await startFakeConnectorHttpServer();
    await app.inject({
      method: 'POST',
      url: '/v1/connectors/register',
      payload: manifestDocumentFixture(baseUrl),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/connectors/register',
      payload: manifestDocumentFixture(baseUrl, {
        connector: { id: 'otro-connector', version: '1.0.0', endpoint: { baseUrl } },
        tools: [
          {
            id: 'otro-connector.consultar',
            connectorId: 'otro-connector',
            version: '1.0.0',
            implementsCapability: 'check_price_and_stock',
            description: 'Otra implementación.',
            riskLevel: 'read',
            requiredScopes: [],
            idempotent: true,
            inputSchema: NAME_JSON_SCHEMA,
            outputSchema: PRICE_JSON_SCHEMA,
          },
        ],
      }),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'CONFLICT' } });
  });
});

describe('GET /v1/capabilities (Sprint 14, Capability Registry)', () => {
  it('returns an empty list when nothing is registered', async () => {
    const app = await buildTestServer();

    const response = await app.inject({ method: 'GET', url: '/v1/capabilities' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ capabilities: [] });
  });

  it('returns each capability with its JSON Schema and implementations after a wire registration', async () => {
    const app = await buildTestServer();
    const baseUrl = await startFakeConnectorHttpServer();
    await app.inject({
      method: 'POST',
      url: '/v1/connectors/register',
      payload: manifestDocumentFixture(baseUrl),
    });

    const response = await app.inject({ method: 'GET', url: '/v1/capabilities' });

    expect(response.statusCode).toBe(200);
    const body: { capabilities: unknown[] } = response.json();
    expect(body.capabilities).toHaveLength(1);
    expect(body.capabilities[0]).toMatchObject({
      id: 'check_price_and_stock',
      version: '1.0.0',
      compensable: false,
      canonicalInputSchema: { type: 'object' },
      implementations: [
        { connectorId: 'wire-connector', toolId: 'wire-connector.consultar', toolVersion: '1.0.0' },
      ],
    });
  });
});

describe('GET /v1/capabilities/:capabilityId (RC2 Fase 1)', () => {
  it('returns the capability with its implementations', async () => {
    const { app, registry } = await buildTestServerWithRegistry();
    registry.registerCapability({
      id: toCapabilityId('test.echo'),
      version: '1.0.0',
      description: 'Eco de prueba.',
      riskLevel: 'read',
      compensable: false,
      canonicalInputSchema: z.object({ message: z.string() }),
      canonicalOutputSchema: z.object({ message: z.string() }),
    });

    const response = await app.inject({ method: 'GET', url: '/v1/capabilities/test.echo' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'test.echo',
      implementations: [
        { connectorId: 'test-connector', toolId: 'test.echo', toolVersion: '1.0.0' },
      ],
    });
  });

  it('returns 404 when the capability is not registered', async () => {
    const { app } = await buildTestServerWithRegistry();

    const response = await app.inject({ method: 'GET', url: '/v1/capabilities/does.not.exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('GET /v1/workflows (RC2 Fase 1)', () => {
  it('returns an empty list when nothing is registered', async () => {
    const { app } = await buildTestServerWithRegistry();

    const response = await app.inject({ method: 'GET', url: '/v1/workflows' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ workflows: [] });
  });

  it('returns each workflow with its steps, without the in-memory mapping functions', async () => {
    const { app, registry } = await buildTestServerWithRegistry();
    registry.registerWorkflow({
      id: toWorkflowId('test.crear-pedido'),
      name: 'Crear pedido',
      version: '1.0.0',
      description: 'Crea un pedido a partir de un carrito.',
      inputs: z.object({}),
      outputs: z.object({}),
      steps: [
        {
          id: 'consultar',
          toolId: TOOL_ID,
          connectorId: CONNECTOR_ID,
          inputMapping: () => ({}),
        },
      ],
    });

    const response = await app.inject({ method: 'GET', url: '/v1/workflows' });

    expect(response.statusCode).toBe(200);
    const body: { workflows: unknown[] } = response.json();
    expect(body.workflows).toEqual([
      {
        id: 'test.crear-pedido',
        name: 'Crear pedido',
        version: '1.0.0',
        description: 'Crea un pedido a partir de un carrito.',
        stepCount: 1,
        steps: [
          {
            id: 'consultar',
            toolId: 'test.echo',
            connectorId: 'test-connector',
            dependsOn: [],
            parallelGroup: null,
          },
        ],
      },
    ]);
  });
});

describe('GET /v1/workflows/:workflowId (RC2 Fase 1)', () => {
  it('returns the workflow detail', async () => {
    const { app, registry } = await buildTestServerWithRegistry();
    registry.registerWorkflow({
      id: toWorkflowId('test.crear-pedido'),
      name: 'Crear pedido',
      version: '1.0.0',
      description: 'Crea un pedido a partir de un carrito.',
      inputs: z.object({}),
      outputs: z.object({}),
      steps: [{ id: 'consultar', toolId: TOOL_ID, inputMapping: () => ({}) }],
    });

    const response = await app.inject({ method: 'GET', url: '/v1/workflows/test.crear-pedido' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: 'test.crear-pedido', stepCount: 1 });
  });

  it('returns 404 when the workflow is not registered', async () => {
    const { app } = await buildTestServerWithRegistry();

    const response = await app.inject({ method: 'GET', url: '/v1/workflows/does.not.exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('GET /v1/connectors (RC2 Fase 1)', () => {
  it('returns each registered connector with its tools', async () => {
    const { app } = await buildTestServerWithRegistry();

    const response = await app.inject({ method: 'GET', url: '/v1/connectors' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      connectors: [
        {
          id: 'test-connector',
          version: '1.0.0',
          toolCount: 1,
          tools: [
            {
              id: 'test.echo',
              implementsCapability: 'test.echo',
              riskLevel: 'read',
              description: 'Eco de prueba.',
            },
          ],
        },
      ],
    });
  });
});

describe('GET /v1/connectors/:connectorId (RC2 Fase 1)', () => {
  it('returns the connector detail', async () => {
    const { app } = await buildTestServerWithRegistry();

    const response = await app.inject({ method: 'GET', url: '/v1/connectors/test-connector' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: 'test-connector', toolCount: 1 });
  });

  it('returns 404 when the connector is not registered', async () => {
    const { app } = await buildTestServerWithRegistry();

    const response = await app.inject({ method: 'GET', url: '/v1/connectors/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('GET /v1/agents (RC2 Fase 2)', () => {
  it('returns an empty list when no agents are registered', async () => {
    const { app } = await buildTestServerWithRegistry();

    const response = await app.inject({ method: 'GET', url: '/v1/agents' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ agents: [] });
  });

  it('returns all registered agents', async () => {
    const { app, registry } = await buildTestServerWithRegistry();
    const capabilityId = toCapabilityId('test.echo');

    registry.registerCapability({
      id: capabilityId,
      version: '1.0.0',
      canonicalInputSchema: z.object({ message: z.string() }),
      canonicalOutputSchema: z.object({ message: z.string() }),
      riskLevel: 'read',
      compensable: false,
      description: 'Eco de prueba.',
    });

    registry.registerAgent({
      id: toAgentId('hermes'),
      version: '1.0.0',
      name: 'Hermes',
      description: 'Agente de prueba',
      model: 'claude-sonnet-5',
      capabilities: [capabilityId],
    });

    const response = await app.inject({ method: 'GET', url: '/v1/agents' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      agents: [
        {
          id: 'hermes',
          version: '1.0.0',
          name: 'Hermes',
          description: 'Agente de prueba',
          model: 'claude-sonnet-5',
          capabilities: ['test.echo'],
        },
      ],
    });
  });
});

describe('GET /v1/agents/:agentId (RC2 Fase 2)', () => {
  it('returns the agent detail', async () => {
    const { app, registry } = await buildTestServerWithRegistry();
    const capabilityId = toCapabilityId('test.echo');

    registry.registerCapability({
      id: capabilityId,
      version: '1.0.0',
      canonicalInputSchema: z.object({ message: z.string() }),
      canonicalOutputSchema: z.object({ message: z.string() }),
      riskLevel: 'read',
      compensable: false,
      description: 'Eco de prueba.',
    });

    registry.registerAgent({
      id: toAgentId('hermes'),
      version: '1.0.0',
      name: 'Hermes',
      description: 'Agente de prueba',
      model: 'claude-sonnet-5',
      capabilities: [capabilityId],
    });

    const response = await app.inject({ method: 'GET', url: '/v1/agents/hermes' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'hermes',
      version: '1.0.0',
      name: 'Hermes',
      model: 'claude-sonnet-5',
    });
  });

  it('returns 404 when the agent is not registered', async () => {
    const { app } = await buildTestServerWithRegistry();

    const response = await app.inject({ method: 'GET', url: '/v1/agents/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});
