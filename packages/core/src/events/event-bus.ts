import type { DomainEvent } from '@autix/contracts';

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

/**
 * EventBus (RFC-000 §18): publica eventos de dominio para efectos
 * secundarios desacoplados (notificaciones, dashboards, analítica) — la
 * ejecución de la Tool en sí sigue siendo request/response, nunca
 * eventual.
 *
 * Port — `InMemoryEventBus` (este mismo directorio) es la única
 * implementación por ahora. RFC-000 recomienda un outbox sobre
 * Postgres/Supabase para el volumen real; sin backend persistente
 * todavía, el in-memory es la elección honesta para v0, no NATS/Kafka
 * "por si acaso".
 */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  /** Devuelve una función para desuscribirse. */
  subscribe(handler: DomainEventHandler): () => void;
}
