import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  toCapabilityId,
  toConnectorId,
  toPrincipalId,
  toTenantId,
  toToolId,
  type ConnectorManifest,
  type DomainEvent,
  type Principal,
  type ToolContract,
} from '@autix/contracts';

import { InMemoryAuditSink } from '../audit/in-memory-audit-sink.js';
import type {
  ConnectorHealthCheckResult,
  ConnectorInvokeRequest,
  ConnectorInvokeResult,
  ConnectorPort,
} from '../connector/connector-port.js';
import { InMemoryConnectorDirectory } from '../connector/in-memory-connector-directory.js';
import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import { ScopePolicyEngine } from '../policy/scope-policy-engine.js';
import { InMemoryRegistryStore } from '../registry/in-memory-registry-store.js';
import { Registry } from '../registry/registry.js';
import { ExecutionEngine } from './execution-engine.js';

const CAMPOLAC = toConnectorId('campolac');
const CONSULTAR_PRECIO = toToolId('campolac.productos.consultar');
const TENANT = toTenantId('campolac');
const HERMES = (grantedScopes: readonly string[] = []): Principal => ({
  principalId: toPrincipalId('hermes-whatsapp'),
  tenantId: TENANT,
  grantedScopes,
});

function tool(overrides: Partial<ToolContract> = {}): ToolContract {
  return {
    id: CONSULTAR_PRECIO,
    connectorId: CAMPOLAC,
    implementsCapability: toCapabilityId('check_price_and_stock'),
    version: '1.0.0',
    inputSchema: z.object({ nombre: z.string() }),
    outputSchema: z.object({ precio: z.number() }),
    riskLevel: 'read',
    requiredScopes: [],
    idempotent: true,
    description: 'Consulta precio y stock.',
    ...overrides,
  };
}

function manifest(overrides: Partial<ConnectorManifest> = {}): ConnectorManifest {
  return { connectorId: CAMPOLAC, version: '0.1.0', tools: [tool()], ...overrides };
}

class FakeConnectorPort implements ConnectorPort {
  readonly invokeCalls: ConnectorInvokeRequest[] = [];

  constructor(private readonly result: ConnectorInvokeResult) {}

  healthCheck(): Promise<ConnectorHealthCheckResult> {
    return Promise.resolve({ status: 'ok' });
  }

  invoke(request: ConnectorInvokeRequest): Promise<ConnectorInvokeResult> {
    this.invokeCalls.push(request);
    return Promise.resolve(this.result);
  }
}

/** Devuelve un resultado distinto en cada llamada sucesiva (para probar reintentos). */
class ScriptedConnectorPort implements ConnectorPort {
  readonly invokeCalls: ConnectorInvokeRequest[] = [];

  constructor(private readonly results: readonly ConnectorInvokeResult[]) {}

  healthCheck(): Promise<ConnectorHealthCheckResult> {
    return Promise.resolve({ status: 'ok' });
  }

  invoke(request: ConnectorInvokeRequest): Promise<ConnectorInvokeResult> {
    this.invokeCalls.push(request);
    const result = this.results[Math.min(this.invokeCalls.length - 1, this.results.length - 1)];
    return Promise.resolve(result ?? { success: true, output: {} });
  }
}

function buildEngine(retry?: { maxAttempts?: number; delayMs?: number }): {
  engine: ExecutionEngine;
  registry: Registry;
  directory: InMemoryConnectorDirectory;
  auditSink: InMemoryAuditSink;
  events: DomainEvent[];
} {
  const registryEventBus = new InMemoryEventBus();
  const registry = new Registry(new InMemoryRegistryStore(), registryEventBus);
  const directory = new InMemoryConnectorDirectory();
  const auditSink = new InMemoryAuditSink();
  const eventBus = new InMemoryEventBus();
  const events: DomainEvent[] = [];
  eventBus.subscribe((event) => {
    events.push(event);
  });
  const engine = new ExecutionEngine({
    registry,
    connectors: directory,
    policyEngine: new ScopePolicyEngine(),
    auditSink,
    eventBus,
    // delayMs: 0 por defecto en los tests — la política real (Sprint 9)
    // usa 50ms lineales, pero esperar eso en cada test sería lento sin
    // aportar nada a lo que se está probando.
    retry: { maxAttempts: 3, delayMs: 0, ...retry },
  });
  return { engine, registry, directory, auditSink, events };
}

describe('ExecutionEngine.invokeTool — happy path', () => {
  it('resolves the tool, validates input/output and returns the connector output', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest());
    const fakeConnector = new FakeConnectorPort({ success: true, output: { precio: 4200 } });
    directory.register(CAMPOLAC, fakeConnector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result).toEqual({ success: true, output: { precio: 4200 } });
  });

  it('sends the connector the version the Registry actually resolved, not "latest"', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest({ tools: [tool({ version: '1.0.0' })] }));
    await registry.registerConnector(
      manifest({ version: '0.2.0', tools: [tool({ version: '2.0.0' })] }),
    );
    const fakeConnector = new FakeConnectorPort({ success: true, output: { precio: 1 } });
    directory.register(CAMPOLAC, fakeConnector);

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(fakeConnector.invokeCalls[0]?.version).toBe('2.0.0');
  });

  it('forwards the principal tenantId, traceId and idempotencyKey as the invocation context', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest());
    const fakeConnector = new FakeConnectorPort({ success: true, output: { precio: 1 } });
    directory.register(CAMPOLAC, fakeConnector);

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-42',
      idempotencyKey: 'idem-1',
    });

    expect(fakeConnector.invokeCalls[0]?.context).toEqual({
      tenantId: TENANT,
      traceId: 'trace-42',
      idempotencyKey: 'idem-1',
    });
  });

  it('allows a tool requiring a scope the principal was granted', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(
      manifest({ tools: [tool({ requiredScopes: ['campolac:productos:read'] })] }),
    );
    const fakeConnector = new FakeConnectorPort({ success: true, output: { precio: 1 } });
    directory.register(CAMPOLAC, fakeConnector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(['campolac:productos:read']),
      traceId: 'trace-1',
    });

    expect(result.success).toBe(true);
  });
});

describe('ExecutionEngine.invokeTool — fallos, sin lanzar excepciones', () => {
  it('returns NOT_FOUND when the tool is not registered, without touching any connector', async () => {
    const { engine } = buildEngine();

    const result = await engine.invokeTool({
      toolId: toToolId('nunca-registrada'),
      input: {},
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns VALIDATION_ERROR on malformed input and never calls the connector', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest());
    const fakeConnector = new FakeConnectorPort({ success: true, output: { precio: 1 } });
    directory.register(CAMPOLAC, fakeConnector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 42 }, // debería ser string
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(fakeConnector.invokeCalls).toHaveLength(0);
  });

  it('returns FORBIDDEN when the principal is missing a required scope, and never calls the connector', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(
      manifest({ tools: [tool({ requiredScopes: ['campolac:productos:read'] })] }),
    );
    const fakeConnector = new FakeConnectorPort({ success: true, output: { precio: 1 } });
    directory.register(CAMPOLAC, fakeConnector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(), // sin scopes
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(fakeConnector.invokeCalls).toHaveLength(0);
  });

  it('returns APPROVAL_REQUIRED for a financial tool and never calls the connector', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest({ tools: [tool({ riskLevel: 'financial' })] }));
    const fakeConnector = new FakeConnectorPort({ success: true, output: { precio: 1 } });
    directory.register(CAMPOLAC, fakeConnector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('APPROVAL_REQUIRED');
    expect(fakeConnector.invokeCalls).toHaveLength(0);
  });

  it('returns CONNECTOR_UNAVAILABLE when the tool is registered but no live connector is', async () => {
    const { engine, registry } = buildEngine();
    await registry.registerConnector(manifest());
    // nunca se registra nada en el ConnectorDirectory

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONNECTOR_UNAVAILABLE');
  });

  it('passes a business error from the connector through verbatim', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest());
    const fakeConnector = new FakeConnectorPort({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' },
    });
    directory.register(CAMPOLAC, fakeConnector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso-inexistente' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' },
    });
  });

  it('returns CONNECTOR_ERROR when the connector output does not match the tool output schema', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest());
    const fakeConnector = new FakeConnectorPort({
      success: true,
      output: { totalmente: 'distinto' },
    });
    directory.register(CAMPOLAC, fakeConnector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONNECTOR_ERROR');
  });
});

describe('ExecutionEngine.invokeTool — auditoría (RFC-000 §16)', () => {
  it('records exactly one success event, with tool/connector/decision populated', async () => {
    const { engine, registry, directory, auditSink } = buildEngine();
    await registry.registerConnector(manifest());
    directory.register(CAMPOLAC, new FakeConnectorPort({ success: true, output: { precio: 1 } }));

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(auditSink.list()).toHaveLength(1);
    const [entry] = auditSink.list();
    expect(entry?.outcome).toBe('success');
    expect(entry?.toolVersion).toBe('1.0.0');
    expect(entry?.connectorId).toBe(CAMPOLAC);
    expect(entry?.decision).toBe('allow');
    expect(entry?.errorCode).toBeUndefined();
    expect(entry?.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry?.invocationId).toBeTruthy();
  });

  it('records a failure event with no tool/connector/decision when the tool was never found', async () => {
    const { engine, auditSink } = buildEngine();

    await engine.invokeTool({
      toolId: toToolId('nunca-registrada'),
      input: {},
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(auditSink.list()).toHaveLength(1);
    const [entry] = auditSink.list();
    expect(entry?.outcome).toBe('failure');
    expect(entry?.errorCode).toBe('NOT_FOUND');
    expect(entry?.toolVersion).toBeUndefined();
    expect(entry?.connectorId).toBeUndefined();
    expect(entry?.decision).toBeUndefined();
  });

  it('records tool/connector but no decision when input validation fails before authorization runs', async () => {
    const { engine, registry, auditSink } = buildEngine();
    await registry.registerConnector(manifest());

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 42 },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    const [entry] = auditSink.list();
    expect(entry?.errorCode).toBe('VALIDATION_ERROR');
    expect(entry?.toolVersion).toBe('1.0.0');
    expect(entry?.decision).toBeUndefined();
  });

  it('records decision: deny on a FORBIDDEN outcome', async () => {
    const { engine, registry, auditSink } = buildEngine();
    await registry.registerConnector(
      manifest({ tools: [tool({ requiredScopes: ['campolac:productos:read'] })] }),
    );

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    const [entry] = auditSink.list();
    expect(entry?.decision).toBe('deny');
    expect(entry?.errorCode).toBe('FORBIDDEN');
  });

  it('records decision: require_approval on an APPROVAL_REQUIRED outcome', async () => {
    const { engine, registry, auditSink } = buildEngine();
    await registry.registerConnector(manifest({ tools: [tool({ riskLevel: 'financial' })] }));

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    const [entry] = auditSink.list();
    expect(entry?.decision).toBe('require_approval');
    expect(entry?.errorCode).toBe('APPROVAL_REQUIRED');
  });

  it('assigns a different invocationId to each invocation', async () => {
    const { engine, registry, directory, auditSink } = buildEngine();
    await registry.registerConnector(manifest());
    directory.register(CAMPOLAC, new FakeConnectorPort({ success: true, output: { precio: 1 } }));

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });
    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-2',
    });

    const [first, second] = auditSink.list();
    expect(first?.invocationId).not.toBe(second?.invocationId);
  });
});

describe('ExecutionEngine.invokeTool — eventos de dominio (RFC-000 §18)', () => {
  it('publishes ToolInvoked then ToolSucceeded on the happy path', async () => {
    const { engine, registry, directory, events } = buildEngine();
    await registry.registerConnector(manifest());
    directory.register(CAMPOLAC, new FakeConnectorPort({ success: true, output: { precio: 1 } }));

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(events.map((e) => e.type)).toEqual(['ToolInvoked', 'ToolSucceeded']);
    const succeeded = events[1];
    if (succeeded?.type === 'ToolSucceeded') {
      expect(succeeded.toolVersion).toBe('1.0.0');
      expect(succeeded.connectorId).toBe(CAMPOLAC);
    }
  });

  it('publishes ToolInvoked then PolicyDenied on a FORBIDDEN outcome', async () => {
    const { engine, registry, events } = buildEngine();
    await registry.registerConnector(
      manifest({ tools: [tool({ requiredScopes: ['campolac:productos:read'] })] }),
    );

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(events.map((e) => e.type)).toEqual(['ToolInvoked', 'PolicyDenied']);
  });

  it('publishes ToolInvoked then ApprovalRequested on an APPROVAL_REQUIRED outcome', async () => {
    const { engine, registry, events } = buildEngine();
    await registry.registerConnector(manifest({ tools: [tool({ riskLevel: 'financial' })] }));

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(events.map((e) => e.type)).toEqual(['ToolInvoked', 'ApprovalRequested']);
  });

  it('publishes ToolInvoked then ToolFailed for a NOT_FOUND/VALIDATION_ERROR/CONNECTOR_* outcome', async () => {
    const { engine, events } = buildEngine();

    await engine.invokeTool({
      toolId: toToolId('nunca-registrada'),
      input: {},
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(events.map((e) => e.type)).toEqual(['ToolInvoked', 'ToolFailed']);
    const failed = events[1];
    if (failed?.type === 'ToolFailed') {
      expect(failed.errorCode).toBe('NOT_FOUND');
    }
  });
});

const UNAVAILABLE: ConnectorInvokeResult = {
  success: false,
  error: { code: 'CONNECTOR_UNAVAILABLE', message: 'no responde' },
};
const SUCCESS_OUTPUT: ConnectorInvokeResult = { success: true, output: { precio: 1 } };
const NOT_FOUND_ERROR: ConnectorInvokeResult = {
  success: false,
  error: { code: 'NOT_FOUND', message: 'no encontrado' },
};

describe('ExecutionEngine.invokeTool — reintento de Tools idempotentes (Sprint 9)', () => {
  it('retries an idempotent tool on CONNECTOR_UNAVAILABLE and succeeds once the connector recovers', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest({ tools: [tool({ idempotent: true })] }));
    const connector = new ScriptedConnectorPort([UNAVAILABLE, SUCCESS_OUTPUT]);
    directory.register(CAMPOLAC, connector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result).toEqual(SUCCESS_OUTPUT);
    expect(connector.invokeCalls).toHaveLength(2);
  });

  it('never retries a non-idempotent tool, even on CONNECTOR_UNAVAILABLE', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest({ tools: [tool({ idempotent: false })] }));
    const connector = new ScriptedConnectorPort([UNAVAILABLE, SUCCESS_OUTPUT]);
    directory.register(CAMPOLAC, connector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    expect(connector.invokeCalls).toHaveLength(1);
  });

  it('never retries a business error, even for an idempotent tool', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest({ tools: [tool({ idempotent: true })] }));
    const connector = new ScriptedConnectorPort([NOT_FOUND_ERROR, SUCCESS_OUTPUT]);
    directory.register(CAMPOLAC, connector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result).toEqual(NOT_FOUND_ERROR);
    expect(connector.invokeCalls).toHaveLength(1);
  });

  it('gives up after maxAttempts and returns the last CONNECTOR_UNAVAILABLE result', async () => {
    const { engine, registry, directory } = buildEngine({ maxAttempts: 2 });
    await registry.registerConnector(manifest({ tools: [tool({ idempotent: true })] }));
    const connector = new ScriptedConnectorPort([UNAVAILABLE, UNAVAILABLE, SUCCESS_OUTPUT]);
    directory.register(CAMPOLAC, connector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    expect(connector.invokeCalls).toHaveLength(2); // maxAttempts, nunca llegó al 3er (exitoso)
  });

  it('sends the same idempotencyKey (the invocationId, since none was given) on every retry attempt', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest({ tools: [tool({ idempotent: true })] }));
    const connector = new ScriptedConnectorPort([UNAVAILABLE, SUCCESS_OUTPUT]);
    directory.register(CAMPOLAC, connector);

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    const [first, second] = connector.invokeCalls;
    expect(first?.context.idempotencyKey).toBeTruthy();
    expect(first?.context.idempotencyKey).toBe(second?.context.idempotencyKey);
  });

  it('reuses the caller-provided idempotencyKey across retries instead of the invocationId', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest({ tools: [tool({ idempotent: true })] }));
    const connector = new ScriptedConnectorPort([UNAVAILABLE, SUCCESS_OUTPUT]);
    directory.register(CAMPOLAC, connector);

    await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
      idempotencyKey: 'caller-supplied-key',
    });

    expect(
      connector.invokeCalls.every((call) => call.context.idempotencyKey === 'caller-supplied-key'),
    ).toBe(true);
  });
});

describe('ExecutionEngine.invokeTool — Tools registradas por wire (JSON Schema, Sprint 14)', () => {
  /**
   * `inputSchema`/`outputSchema` (Zod) quedan en `z.unknown()` para una Tool
   * registrada por wire (ver `wire-conversion.ts`) — `z.unknown()` acepta
   * cualquier cosa, así que estos tests solo pueden pasar si el
   * `ExecutionEngine` realmente valida contra `inputJsonSchema`/
   * `outputJsonSchema` (vía ajv), no contra el placeholder Zod.
   */
  function wireTool(overrides: Partial<ToolContract> = {}): ToolContract {
    return tool({
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      inputJsonSchema: {
        type: 'object',
        properties: { nombre: { type: 'string' } },
        required: ['nombre'],
      },
      outputJsonSchema: {
        type: 'object',
        properties: { precio: { type: 'number' } },
        required: ['precio'],
      },
      ...overrides,
    });
  }

  it('validates input against inputJsonSchema (ajv) and succeeds when it matches', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest({ tools: [wireTool()] }));
    directory.register(
      CAMPOLAC,
      new FakeConnectorPort({ success: true, output: { precio: 4200 } }),
    );

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result).toEqual({ success: true, output: { precio: 4200 } });
  });

  it('returns VALIDATION_ERROR when input fails inputJsonSchema, without calling the connector', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest({ tools: [wireTool()] }));
    const connector = new FakeConnectorPort({ success: true, output: { precio: 1 } });
    directory.register(CAMPOLAC, connector);

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 42 },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(connector.invokeCalls).toHaveLength(0);
  });

  it('returns CONNECTOR_ERROR when the connector output fails outputJsonSchema', async () => {
    const { engine, registry, directory } = buildEngine();
    await registry.registerConnector(manifest({ tools: [wireTool()] }));
    directory.register(
      CAMPOLAC,
      new FakeConnectorPort({ success: true, output: { precio: 'no-es-un-numero' } }),
    );

    const result = await engine.invokeTool({
      toolId: CONSULTAR_PRECIO,
      input: { nombre: 'queso' },
      principal: HERMES(),
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONNECTOR_ERROR');
  });
});
