import type { AuditEvent } from '@autix/contracts';

/**
 * AuditSink (RFC-000 §16): destino append-only de `AuditEvent`s. Port —
 * `InMemoryAuditSink` (este mismo directorio) es la única implementación
 * por ahora; un backend persistente (Postgres/Supabase) la reemplaza sin
 * tocar `ExecutionEngine`, que es quien la usa.
 *
 * `record` es async porque un sink real hace I/O — el in-memory de v0
 * resuelve de inmediato, pero la interfaz ya está pensada para eso.
 */
export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}
