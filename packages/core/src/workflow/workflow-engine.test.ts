import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  toCapabilityId,
  toConnectorId,
  toPrincipalId,
  toTenantId,
  toToolId,
  toWorkflowId,
  type DomainEvent,
  type Principal,
  type ToolContract,
  type WorkflowContract,
  type WorkflowRetryPolicy,
  type WorkflowStep,
} from '@autix/contracts';

import { InMemoryAuditSink } from '../audit/in-memory-audit-sink.js';
import type {
  ConnectorHealthCheckResult,
  ConnectorInvokeRequest,
  ConnectorInvokeResult,
  ConnectorPort,
} from '../connector/connector-port.js';
import { InMemoryConnectorDirectory } from '../connector/in-memory-connector-directory.js';
import { ExecutionEngine } from '../execution/execution-engine.js';
import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import { ScopePolicyEngine } from '../policy/scope-policy-engine.js';
import { InMemoryRegistryStore } from '../registry/in-memory-registry-store.js';
import { Registry } from '../registry/registry.js';
import { WorkflowEngine } from './workflow-engine.js';

const CAMPOLAC = toConnectorId('campolac');
const WHATSAPP = toConnectorId('whatsapp');
const TENANT = toTenantId('campolac');
const AGENT: Principal = {
  principalId: toPrincipalId('hermes-whatsapp'),
  tenantId: TENANT,
  grantedScopes: [],
};
const WORKFLOW_ID = toWorkflowId('campolac.crear-pedido');

// `Array.isArray` narrows a union to `any[]` en la lib estándar de TS —
// este guard propio preserva el tipo real del elemento.
function isResultArray(
  value: ConnectorInvokeResult | readonly ConnectorInvokeResult[],
): value is readonly ConnectorInvokeResult[] {
  return Array.isArray(value);
}

/** Devuelve, por cada `toolId`, el/los resultados scripteados (se repite el último). */
class MultiToolConnectorPort implements ConnectorPort {
  readonly invokeCalls: ConnectorInvokeRequest[] = [];
  private readonly queues: Map<string, ConnectorInvokeResult[]>;

  constructor(scripts: Record<string, ConnectorInvokeResult | readonly ConnectorInvokeResult[]>) {
    this.queues = new Map();
    for (const [toolId, script] of Object.entries(scripts)) {
      this.queues.set(toolId, isResultArray(script) ? [...script] : [script]);
    }
  }

  healthCheck(): Promise<ConnectorHealthCheckResult> {
    return Promise.resolve({ status: 'ok' });
  }

  invoke(request: ConnectorInvokeRequest): Promise<ConnectorInvokeResult> {
    this.invokeCalls.push(request);
    const queue = this.queues.get(request.toolId);
    if (!queue || queue.length === 0) {
      return Promise.resolve({ success: true, output: {} });
    }
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return Promise.resolve(next ?? { success: true, output: {} });
  }
}

function tool(id: string, overrides: Partial<ToolContract> = {}): ToolContract {
  return {
    id: toToolId(id),
    connectorId: CAMPOLAC,
    implementsCapability: toCapabilityId('generic'),
    version: '1.0.0',
    inputSchema: z.any(),
    outputSchema: z.any(),
    riskLevel: 'read',
    requiredScopes: [],
    idempotent: false,
    description: `test tool ${id}`,
    ...overrides,
  };
}

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step',
    toolId: toToolId('campolac.consultar-stock'),
    inputMapping: () => ({}),
    ...overrides,
  };
}

function workflow(overrides: Partial<WorkflowContract> = {}): WorkflowContract {
  return {
    id: WORKFLOW_ID,
    name: 'Crear pedido',
    version: '1.0.0',
    description: 'Workflow de prueba.',
    inputs: z.record(z.string(), z.unknown()),
    outputs: z.record(z.string(), z.unknown()),
    steps: [step()],
    ...overrides,
  };
}

interface Harness {
  readonly registry: Registry;
  readonly eventBus: InMemoryEventBus;
  readonly workflowEngine: WorkflowEngine;
  readonly connectors: InMemoryConnectorDirectory;
}

/**
 * El `ExecutionEngine` interno arranca con `retry: { maxAttempts: 1 }` (sin
 * reintento propio) para que los tests de reintento de este archivo
 * verifiquen específicamente el reintento del `WorkflowEngine`, no el de
 * `ExecutionEngine` (Sprint 9) — ya probado en `execution-engine.test.ts`.
 */
function buildHarness(): Harness {
  const eventBus = new InMemoryEventBus();
  const registry = new Registry(new InMemoryRegistryStore(), eventBus);
  const connectors = new InMemoryConnectorDirectory();
  const executionEngine = new ExecutionEngine({
    registry,
    connectors,
    policyEngine: new ScopePolicyEngine(),
    auditSink: new InMemoryAuditSink(),
    eventBus,
    retry: { maxAttempts: 1 },
  });
  const workflowEngine = new WorkflowEngine({ registry, executionEngine, eventBus });
  return { registry, eventBus, workflowEngine, connectors };
}

describe('WorkflowEngine.executeWorkflow — secuencia lineal', () => {
  it('runs dependent steps in order, passing prior output through the context', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();

    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [
        tool('campolac.consultar-stock', { outputSchema: z.object({ stockKg: z.number() }) }),
        tool('campolac.crear-pedido', { inputSchema: z.object({ cantidad: z.number() }) }),
      ],
    });
    connectors.register(
      CAMPOLAC,
      new MultiToolConnectorPort({
        'campolac.consultar-stock': { success: true, output: { stockKg: 40 } },
        'campolac.crear-pedido': { success: true, output: { pedidoId: 'p-1' } },
      }),
    );

    registry.registerWorkflow(
      workflow({
        steps: [
          step({ id: 'consultar', toolId: toToolId('campolac.consultar-stock') }),
          step({
            id: 'crear',
            toolId: toToolId('campolac.crear-pedido'),
            dependsOn: ['consultar'],
            inputMapping: (context) => ({
              cantidad: (context.steps['consultar']?.output as { stockKg: number }).stockKg,
            }),
          }),
        ],
        outputs: z.object({ crear: z.object({ pedidoId: z.string() }) }),
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toEqual({ crear: { pedidoId: 'p-1' } });
      expect(result.steps['consultar']).toEqual({ status: 'succeeded', output: { stockKg: 40 } });
      expect(result.steps['crear']).toEqual({ status: 'succeeded', output: { pedidoId: 'p-1' } });
    }
  });
});

describe('WorkflowEngine.executeWorkflow — ramas condicionales', () => {
  it('runs a step whose condition evaluates true', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [tool('campolac.aplicar-descuento')],
    });
    const port = new MultiToolConnectorPort({
      'campolac.aplicar-descuento': { success: true, output: { descontado: true } },
    });
    connectors.register(CAMPOLAC, port);

    registry.registerWorkflow(
      workflow({
        steps: [
          step({
            id: 'descuento',
            toolId: toToolId('campolac.aplicar-descuento'),
            condition: (context) => (context.workflowInput as { esMayorista: boolean }).esMayorista,
          }),
        ],
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: { esMayorista: true },
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(true);
    expect(port.invokeCalls).toHaveLength(1);
    if (result.success) {
      expect(result.steps['descuento']?.status).toBe('succeeded');
    }
  });

  it('skips a step whose condition evaluates false, without invoking its Tool', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [tool('campolac.aplicar-descuento')],
    });
    const port = new MultiToolConnectorPort({
      'campolac.aplicar-descuento': { success: true, output: { descontado: true } },
    });
    connectors.register(CAMPOLAC, port);

    registry.registerWorkflow(
      workflow({
        steps: [
          step({
            id: 'descuento',
            toolId: toToolId('campolac.aplicar-descuento'),
            condition: (context) => (context.workflowInput as { esMayorista: boolean }).esMayorista,
          }),
        ],
        outputs: z.record(z.string(), z.unknown()),
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: { esMayorista: false },
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(true);
    expect(port.invokeCalls).toHaveLength(0);
    if (result.success) {
      expect(result.steps['descuento']).toEqual({ status: 'skipped' });
    }
  });
});

describe('WorkflowEngine.executeWorkflow — paralelismo', () => {
  it('runs independent steps concurrently (same wave), both reflected in the result', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [tool('campolac.enviar-recibo'), tool('campolac.actualizar-stock')],
    });
    connectors.register(
      CAMPOLAC,
      new MultiToolConnectorPort({
        'campolac.enviar-recibo': { success: true, output: { enviado: true } },
        'campolac.actualizar-stock': { success: true, output: { actualizado: true } },
      }),
    );

    registry.registerWorkflow(
      workflow({
        steps: [
          step({
            id: 'recibo',
            toolId: toToolId('campolac.enviar-recibo'),
            parallelGroup: 'post-venta',
          }),
          step({
            id: 'stock',
            toolId: toToolId('campolac.actualizar-stock'),
            parallelGroup: 'post-venta',
          }),
        ],
        outputs: z.object({
          recibo: z.object({ enviado: z.boolean() }),
          stock: z.object({ actualizado: z.boolean() }),
        }),
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toEqual({ recibo: { enviado: true }, stock: { actualizado: true } });
    }
  });
});

describe('WorkflowEngine.executeWorkflow — multi-Connector', () => {
  it('runs steps that belong to different Connectors within the same execution', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [tool('campolac.crear-pedido')],
    });
    await registry.registerConnector({
      connectorId: WHATSAPP,
      version: '1.0.0',
      tools: [tool('whatsapp.enviar-confirmacion', { connectorId: WHATSAPP })],
    });
    connectors.register(
      CAMPOLAC,
      new MultiToolConnectorPort({
        'campolac.crear-pedido': { success: true, output: { pedidoId: 'p-1' } },
      }),
    );
    connectors.register(
      WHATSAPP,
      new MultiToolConnectorPort({
        'whatsapp.enviar-confirmacion': { success: true, output: { enviado: true } },
      }),
    );

    registry.registerWorkflow(
      workflow({
        steps: [
          step({ id: 'pedido', toolId: toToolId('campolac.crear-pedido'), connectorId: CAMPOLAC }),
          step({
            id: 'confirmacion',
            toolId: toToolId('whatsapp.enviar-confirmacion'),
            connectorId: WHATSAPP,
            dependsOn: ['pedido'],
          }),
        ],
        outputs: z.object({ confirmacion: z.object({ enviado: z.boolean() }) }),
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toEqual({ confirmacion: { enviado: true } });
    }
  });

  it('fails a step whose declared connectorId does not match the Tool it resolves to', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [tool('campolac.crear-pedido')],
    });
    connectors.register(CAMPOLAC, new MultiToolConnectorPort({}));

    registry.registerWorkflow(
      workflow({
        steps: [
          step({ id: 'pedido', toolId: toToolId('campolac.crear-pedido'), connectorId: WHATSAPP }),
        ],
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('WorkflowEngine.executeWorkflow — transaccionalidad (saga)', () => {
  it('compensates already-succeeded steps in reverse order when a later step fails', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [
        tool('campolac.crear-pedido', {
          compensable: true,
          compensatedBy: toToolId('campolac.cancelar-pedido'),
        }),
        tool('campolac.cancelar-pedido'),
        tool('campolac.reservar-stock', {
          compensable: true,
          compensatedBy: toToolId('campolac.liberar-stock'),
        }),
        tool('campolac.liberar-stock'),
        tool('campolac.cobrar-pago'),
      ],
    });
    const port = new MultiToolConnectorPort({
      'campolac.crear-pedido': { success: true, output: { pedidoId: 'p-1' } },
      'campolac.reservar-stock': { success: true, output: { reservaId: 'r-1' } },
      'campolac.cobrar-pago': {
        success: false,
        error: { code: 'CONNECTOR_ERROR', message: 'tarjeta rechazada' },
      },
      'campolac.cancelar-pedido': { success: true, output: {} },
      'campolac.liberar-stock': { success: true, output: {} },
    });
    connectors.register(CAMPOLAC, port);

    const compensationCalls: string[] = [];

    registry.registerWorkflow(
      workflow({
        steps: [
          step({
            id: 'pedido',
            toolId: toToolId('campolac.crear-pedido'),
            compensation: {
              toolId: toToolId('campolac.cancelar-pedido'),
              inputMapping: (context) => {
                compensationCalls.push('pedido');
                return {
                  pedidoId: (context.steps['pedido']?.output as { pedidoId: string }).pedidoId,
                };
              },
            },
          }),
          step({
            id: 'stock',
            toolId: toToolId('campolac.reservar-stock'),
            dependsOn: ['pedido'],
            compensation: {
              toolId: toToolId('campolac.liberar-stock'),
              inputMapping: () => {
                compensationCalls.push('stock');
                return {};
              },
            },
          }),
          step({ id: 'pago', toolId: toToolId('campolac.cobrar-pago'), dependsOn: ['stock'] }),
        ],
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONNECTOR_ERROR');
      // orden inverso de ejecución: "stock" (segundo en correr) se compensa primero
      expect(result.compensatedSteps).toEqual(['stock', 'pedido']);
      expect(result.steps['pago']).toEqual({ status: 'failed' });
    }
    expect(compensationCalls).toEqual(['stock', 'pedido']);
    expect(port.invokeCalls.map((c) => c.toolId)).toEqual([
      'campolac.crear-pedido',
      'campolac.reservar-stock',
      'campolac.cobrar-pago',
      'campolac.liberar-stock',
      'campolac.cancelar-pedido',
    ]);
  });

  it('does not compensate a succeeded step that declared no compensation', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [tool('campolac.consultar-stock'), tool('campolac.cobrar-pago')],
    });
    connectors.register(
      CAMPOLAC,
      new MultiToolConnectorPort({
        'campolac.consultar-stock': { success: true, output: { stockKg: 40 } },
        'campolac.cobrar-pago': {
          success: false,
          error: { code: 'CONNECTOR_ERROR', message: 'falló' },
        },
      }),
    );

    registry.registerWorkflow(
      workflow({
        steps: [
          step({ id: 'consultar', toolId: toToolId('campolac.consultar-stock') }),
          step({ id: 'pago', toolId: toToolId('campolac.cobrar-pago'), dependsOn: ['consultar'] }),
        ],
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.compensatedSteps).toEqual([]);
    }
  });

  it('also compensates when every step succeeds but the aggregate output fails its schema', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [
        tool('campolac.crear-pedido', {
          compensable: true,
          compensatedBy: toToolId('campolac.cancelar-pedido'),
        }),
        tool('campolac.cancelar-pedido'),
      ],
    });
    connectors.register(
      CAMPOLAC,
      new MultiToolConnectorPort({
        'campolac.crear-pedido': { success: true, output: { pedidoId: 42 } }, // número, no string — no cumple outputs
        'campolac.cancelar-pedido': { success: true, output: {} },
      }),
    );

    registry.registerWorkflow(
      workflow({
        steps: [
          step({
            id: 'pedido',
            toolId: toToolId('campolac.crear-pedido'),
            compensation: {
              toolId: toToolId('campolac.cancelar-pedido'),
              inputMapping: () => ({}),
            },
          }),
        ],
        outputs: z.object({ pedido: z.object({ pedidoId: z.string() }) }),
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.compensatedSteps).toEqual(['pedido']);
    }
  });
});

describe('WorkflowEngine.executeWorkflow — reintento a nivel Workflow', () => {
  const retryPolicy: WorkflowRetryPolicy = { maxAttempts: 3, delayMs: 0 };

  it('retries a step whose Tool is idempotent after a CONNECTOR_UNAVAILABLE failure', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [tool('campolac.consultar-stock', { idempotent: true })],
    });
    const port = new MultiToolConnectorPort({
      'campolac.consultar-stock': [
        { success: false, error: { code: 'CONNECTOR_UNAVAILABLE', message: 'no responde' } },
        { success: true, output: { stockKg: 40 } },
      ],
    });
    connectors.register(CAMPOLAC, port);

    registry.registerWorkflow(
      workflow({
        retryPolicy,
        steps: [step({ id: 'consultar', toolId: toToolId('campolac.consultar-stock') })],
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(true);
    expect(port.invokeCalls).toHaveLength(2);
  });

  it('never retries a step whose Tool is not idempotent, even with a retryPolicy configured', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [tool('campolac.cobrar-pago', { idempotent: false })],
    });
    const port = new MultiToolConnectorPort({
      'campolac.cobrar-pago': [
        { success: false, error: { code: 'CONNECTOR_UNAVAILABLE', message: 'no responde' } },
        { success: true, output: {} },
      ],
    });
    connectors.register(CAMPOLAC, port);

    registry.registerWorkflow(
      workflow({
        retryPolicy,
        steps: [step({ id: 'pago', toolId: toToolId('campolac.cobrar-pago') })],
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    expect(port.invokeCalls).toHaveLength(1);
  });

  it('never retries a business error, even on an idempotent Tool', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [tool('campolac.consultar-stock', { idempotent: true })],
    });
    const port = new MultiToolConnectorPort({
      'campolac.consultar-stock': [
        { success: false, error: { code: 'NOT_FOUND', message: 'producto inexistente' } },
      ],
    });
    connectors.register(CAMPOLAC, port);

    registry.registerWorkflow(
      workflow({
        retryPolicy,
        steps: [step({ id: 'consultar', toolId: toToolId('campolac.consultar-stock') })],
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    expect(port.invokeCalls).toHaveLength(1);
  });
});

describe('WorkflowEngine.executeWorkflow — timeout', () => {
  it('fails with TIMEOUT and compensates completed steps when the workflow exceeds its timeout', async () => {
    const { registry, connectors, workflowEngine } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [
        tool('campolac.crear-pedido', {
          compensable: true,
          compensatedBy: toToolId('campolac.cancelar-pedido'),
        }),
        tool('campolac.cancelar-pedido'),
        tool('campolac.cobrar-pago'),
      ],
    });
    connectors.register(
      CAMPOLAC,
      new MultiToolConnectorPort({
        'campolac.crear-pedido': { success: true, output: { pedidoId: 'p-1' } },
        'campolac.cobrar-pago': { success: true, output: {} },
        'campolac.cancelar-pedido': { success: true, output: {} },
      }),
    );

    registry.registerWorkflow(
      workflow({
        // timeout ya vencido antes de la primera tanda -> nada llega a correr,
        // y el step "pedido" nunca corrió, así que no hay nada que compensar.
        timeout: -1,
        steps: [
          step({
            id: 'pedido',
            toolId: toToolId('campolac.crear-pedido'),
            compensation: {
              toolId: toToolId('campolac.cancelar-pedido'),
              inputMapping: () => ({}),
            },
          }),
        ],
      }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TIMEOUT');
      expect(result.compensatedSteps).toEqual([]);
    }
  });
});

describe('WorkflowEngine.executeWorkflow — validación de entrada/salida y recursos inexistentes', () => {
  it('fails with VALIDATION_ERROR when the input does not match the workflow input schema', async () => {
    const { registry, workflowEngine } = buildHarness();
    registry.registerWorkflow(workflow({ inputs: z.object({ producto: z.string() }), steps: [] }));

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('fails with NOT_FOUND for an unregistered workflow', async () => {
    const { workflowEngine } = buildHarness();

    const result = await workflowEngine.executeWorkflow({
      workflowId: toWorkflowId('nunca-registrado'),
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('fails a step (and the workflow) when its toolId does not resolve in the Registry', async () => {
    const { registry, workflowEngine } = buildHarness();
    registry.registerWorkflow(
      workflow({ steps: [step({ id: 'fantasma', toolId: toToolId('nunca-registrada') })] }),
    );

    const result = await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});

describe('WorkflowEngine.executeWorkflow — eventos de dominio (RFC-000 §18)', () => {
  it('publishes WorkflowStarted then WorkflowSucceeded on a successful run', async () => {
    const { registry, connectors, workflowEngine, eventBus } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [tool('campolac.consultar-stock')],
    });
    connectors.register(
      CAMPOLAC,
      new MultiToolConnectorPort({ 'campolac.consultar-stock': { success: true, output: {} } }),
    );
    registry.registerWorkflow(
      workflow({
        steps: [step({ id: 'consultar', toolId: toToolId('campolac.consultar-stock') })],
      }),
    );

    const received: DomainEvent[] = [];
    eventBus.subscribe((event) => {
      received.push(event);
    });

    await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    expect(received.map((e) => e.type)).toEqual([
      'WorkflowStarted',
      'ToolInvoked',
      'ToolSucceeded',
      'WorkflowSucceeded',
    ]);
  });

  it('publishes WorkflowStepCompensated for each compensation attempt, then WorkflowFailed', async () => {
    const { registry, connectors, workflowEngine, eventBus } = buildHarness();
    await registry.registerConnector({
      connectorId: CAMPOLAC,
      version: '1.0.0',
      tools: [
        tool('campolac.crear-pedido', {
          compensable: true,
          compensatedBy: toToolId('campolac.cancelar-pedido'),
        }),
        tool('campolac.cancelar-pedido'),
        tool('campolac.cobrar-pago'),
      ],
    });
    connectors.register(
      CAMPOLAC,
      new MultiToolConnectorPort({
        'campolac.crear-pedido': { success: true, output: {} },
        'campolac.cobrar-pago': {
          success: false,
          error: { code: 'CONNECTOR_ERROR', message: 'falló' },
        },
        'campolac.cancelar-pedido': { success: true, output: {} },
      }),
    );
    registry.registerWorkflow(
      workflow({
        steps: [
          step({
            id: 'pedido',
            toolId: toToolId('campolac.crear-pedido'),
            compensation: {
              toolId: toToolId('campolac.cancelar-pedido'),
              inputMapping: () => ({}),
            },
          }),
          step({ id: 'pago', toolId: toToolId('campolac.cobrar-pago'), dependsOn: ['pedido'] }),
        ],
      }),
    );

    const received: DomainEvent[] = [];
    eventBus.subscribe((event) => {
      received.push(event);
    });

    await workflowEngine.executeWorkflow({
      workflowId: WORKFLOW_ID,
      input: {},
      principal: AGENT,
      traceId: 'trace-1',
    });

    const types = received.map((e) => e.type);
    expect(types).toContain('WorkflowStepCompensated');
    expect(types.at(-1)).toBe('WorkflowFailed');

    const compensated = received.find((e) => e.type === 'WorkflowStepCompensated');
    if (compensated?.type === 'WorkflowStepCompensated') {
      expect(compensated.stepId).toBe('pedido');
      expect(compensated.succeeded).toBe(true);
    }
  });
});
