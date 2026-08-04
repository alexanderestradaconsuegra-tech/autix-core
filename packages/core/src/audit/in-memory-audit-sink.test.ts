import { describe, expect, it } from 'vitest';
import { toPrincipalId, toTenantId, toToolId, type AuditEvent } from '@autix/contracts';

import { InMemoryAuditSink } from './in-memory-audit-sink.js';

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    invocationId: 'inv-1',
    timestamp: new Date(0).toISOString(),
    tenantId: toTenantId('campolac'),
    principalId: toPrincipalId('hermes-whatsapp'),
    toolId: toToolId('campolac.productos.consultar'),
    outcome: 'success',
    durationMs: 5,
    ...overrides,
  };
}

describe('InMemoryAuditSink', () => {
  it('starts empty', () => {
    expect(new InMemoryAuditSink().list()).toEqual([]);
  });

  it('accumulates every recorded event, in order, without deduplicating', async () => {
    const sink = new InMemoryAuditSink();

    await sink.record(event({ invocationId: 'inv-1' }));
    await sink.record(event({ invocationId: 'inv-2', outcome: 'failure', errorCode: 'NOT_FOUND' }));

    expect(sink.list().map((e) => e.invocationId)).toEqual(['inv-1', 'inv-2']);
    expect(sink.list()[1]?.errorCode).toBe('NOT_FOUND');
  });
});
