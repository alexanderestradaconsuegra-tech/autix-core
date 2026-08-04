import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import type {
  AuditEvent,
  CapabilityContract,
  ConnectorManifest,
  DomainEvent,
  Principal,
  ToolContract,
} from './index.js';
import { toCapabilityId, toConnectorId, toPrincipalId, toTenantId, toToolId } from './index.js';

describe('@autix/contracts — composition end to end', () => {
  it('lets a ToolContract implement a CapabilityContract and both fit in a ConnectorManifest', () => {
    const checkPriceAndStock: CapabilityContract = {
      id: toCapabilityId('check_price_and_stock'),
      version: '1.0.0',
      canonicalInputSchema: z.object({ productRef: z.string() }),
      canonicalOutputSchema: z.object({ price: z.number(), stockQty: z.number() }),
      riskLevel: 'read',
      description: 'Consulta precio y stock de un producto (RFC-001 §9).',
      compensable: false,
    };

    const consultarPrecioStock: ToolContract = {
      id: toToolId('campolac.productos.consultar'),
      connectorId: toConnectorId('campolac'),
      implementsCapability: checkPriceAndStock.id,
      version: '1.0.0',
      inputSchema: z.object({ nombre: z.string() }),
      outputSchema: z.object({ precio_mayor: z.number(), stock_kg: z.number() }),
      riskLevel: 'read',
      requiredScopes: ['campolac:productos:read'],
      idempotent: true,
      description: 'Consulta precio y stock en el schema nativo de Campolac.',
    };

    const manifest: ConnectorManifest = {
      connectorId: toConnectorId('campolac'),
      version: '0.1.0',
      tools: [consultarPrecioStock],
    };

    expect(manifest.tools[0]?.implementsCapability).toBe(checkPriceAndStock.id);
    expect(manifest.tools[0]?.riskLevel).toBe(checkPriceAndStock.riskLevel);

    const hermes: Principal = {
      principalId: toPrincipalId('hermes-whatsapp'),
      tenantId: toTenantId('campolac'),
      grantedScopes: ['campolac:productos:read'],
    };
    expect(
      consultarPrecioStock.requiredScopes.every((scope) => hermes.grantedScopes.includes(scope)),
    ).toBe(true);

    const auditEvent: AuditEvent = {
      invocationId: 'inv-1',
      timestamp: new Date(0).toISOString(),
      tenantId: hermes.tenantId,
      principalId: hermes.principalId,
      toolId: consultarPrecioStock.id,
      toolVersion: consultarPrecioStock.version,
      connectorId: consultarPrecioStock.connectorId,
      decision: 'allow',
      outcome: 'success',
      durationMs: 12,
    };
    expect(auditEvent.errorCode).toBeUndefined();

    const events: DomainEvent[] = [
      {
        type: 'ToolInvoked',
        invocationId: 'inv-1',
        timestamp: auditEvent.timestamp,
        toolId: consultarPrecioStock.id,
        tenantId: hermes.tenantId,
        principalId: hermes.principalId,
        traceId: 'trace-1',
      },
      {
        type: 'ToolSucceeded',
        invocationId: 'inv-1',
        timestamp: auditEvent.timestamp,
        toolId: consultarPrecioStock.id,
        toolVersion: consultarPrecioStock.version,
        connectorId: consultarPrecioStock.connectorId,
        durationMs: auditEvent.durationMs,
      },
    ];
    expect(events.map((event) => event.type)).toEqual(['ToolInvoked', 'ToolSucceeded']);
  });
});
