import type { AuditEvent } from '@autix/contracts';

import type { AuditSink } from './audit-sink.js';

/**
 * Implementación in-memory de `AuditSink` (Sprint 7). Se pierde al
 * reiniciar — suficiente para desarrollo y tests, no para producción
 * (RFC-000 §16 exige retención configurable e inmutabilidad forzada por
 * el storage, ninguna de las dos aplica a un array en memoria).
 */
export class InMemoryAuditSink implements AuditSink {
  private readonly events: AuditEvent[] = [];

  record(event: AuditEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  list(): readonly AuditEvent[] {
    return this.events;
  }
}
