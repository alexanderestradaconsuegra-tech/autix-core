import type { DomainEvent } from '@autix/contracts';

import type { DomainEventHandler, EventBus } from './event-bus.js';

/**
 * Implementación in-memory de `EventBus` (Sprint 8). `publish` espera a
 * cada suscriptor en orden (síncrono en la práctica) — un EventBus real
 * (outbox/NATS/Kafka) desacoplaría esto de la respuesta al agente; no se
 * implementa esa asincronía real todavía porque no hay backend real
 * detrás de este v0.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Set<DomainEventHandler>();

  async publish(event: DomainEvent): Promise<void> {
    for (const handler of this.handlers) {
      await handler(event);
    }
  }

  subscribe(handler: DomainEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
