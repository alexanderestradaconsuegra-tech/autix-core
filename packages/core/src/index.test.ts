import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  toCapabilityId,
  toConnectorId,
  toPrincipalId,
  toTenantId,
  toToolId,
} from '@autix/contracts';

import {
  CORE_PACKAGE_NAME,
  CORE_PACKAGE_VERSION,
  ERROR_CODES,
  ExecutionEngine,
  HttpConnectorClient,
  InMemoryAuditSink,
  InMemoryConnectorDirectory,
  InMemoryEventBus,
  InMemoryRegistryStore,
  Registry,
  RISK_LEVELS,
  ScopePolicyEngine,
} from './index.js';

describe('@autix/core', () => {
  it('exposes its own package identity', () => {
    expect(CORE_PACKAGE_NAME).toBe('@autix/core');
    expect(CORE_PACKAGE_VERSION).toBe('0.0.0');
  });

  it('resolves its workspace dependency on @autix/contracts', () => {
    expect(RISK_LEVELS).toContain('financial');
    expect(ERROR_CODES).toContain('VALIDATION_ERROR');
  });

  it('exposes a working Registry through the barrel', async () => {
    const registry = new Registry(new InMemoryRegistryStore(), new InMemoryEventBus());
    const toolId = toToolId('campolac.productos.consultar');

    await registry.registerConnector({
      connectorId: toConnectorId('campolac'),
      version: '0.1.0',
      tools: [
        {
          id: toolId,
          connectorId: toConnectorId('campolac'),
          implementsCapability: toCapabilityId('check_price_and_stock'),
          version: '1.0.0',
          inputSchema: z.object({ nombre: z.string() }),
          outputSchema: z.object({ precio: z.number() }),
          riskLevel: 'read',
          requiredScopes: [],
          idempotent: true,
          description: 'Consulta precio y stock.',
        },
      ],
    });

    expect(registry.getTool(toolId).version).toBe('1.0.0');
  });

  it('exposes HttpConnectorClient through the barrel, tolerant of an unreachable Connector', async () => {
    const client = new HttpConnectorClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 200 });

    expect((await client.healthCheck()).status).toBe('down');
  });

  it('wires Registry + ConnectorDirectory + PolicyEngine + AuditSink + EventBus + ExecutionEngine together through the barrel', async () => {
    const registry = new Registry(new InMemoryRegistryStore(), new InMemoryEventBus());
    const directory = new InMemoryConnectorDirectory();
    const auditSink = new InMemoryAuditSink();
    const eventBus = new InMemoryEventBus();
    const engine = new ExecutionEngine({
      registry,
      connectors: directory,
      policyEngine: new ScopePolicyEngine(),
      auditSink,
      eventBus,
    });
    const toolId = toToolId('campolac.productos.consultar');
    const connectorId = toConnectorId('campolac');

    await registry.registerConnector({
      connectorId,
      version: '0.1.0',
      tools: [
        {
          id: toolId,
          connectorId,
          implementsCapability: toCapabilityId('check_price_and_stock'),
          version: '1.0.0',
          inputSchema: z.object({ nombre: z.string() }),
          outputSchema: z.object({ precio: z.number() }),
          riskLevel: 'read',
          requiredScopes: [],
          idempotent: true,
          description: 'Consulta precio y stock.',
        },
      ],
    });
    directory.register(connectorId, {
      healthCheck: () => Promise.resolve({ status: 'ok' }),
      invoke: () => Promise.resolve({ success: true, output: { precio: 4200 } }),
    });

    const result = await engine.invokeTool({
      toolId,
      input: { nombre: 'queso' },
      principal: {
        principalId: toPrincipalId('hermes-whatsapp'),
        tenantId: toTenantId('campolac'),
        grantedScopes: [],
      },
      traceId: 'trace-1',
    });

    expect(result).toEqual({ success: true, output: { precio: 4200 } });
    expect(auditSink.list()).toHaveLength(1);
    expect(auditSink.list()[0]?.outcome).toBe('success');
  });
});
