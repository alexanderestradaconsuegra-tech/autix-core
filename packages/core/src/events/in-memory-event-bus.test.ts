import { describe, expect, it } from 'vitest';
import { toConnectorId, type DomainEvent } from '@autix/contracts';

import { InMemoryEventBus } from './in-memory-event-bus.js';

function connectorRegisteredEvent(): DomainEvent {
  return {
    type: 'ConnectorRegistered',
    timestamp: new Date(0).toISOString(),
    connectorId: toConnectorId('campolac'),
    version: '0.1.0',
    toolCount: 1,
  };
}

describe('InMemoryEventBus', () => {
  it('delivers a published event to every subscriber', async () => {
    const bus = new InMemoryEventBus();
    const receivedByA: DomainEvent[] = [];
    const receivedByB: DomainEvent[] = [];
    bus.subscribe((event) => {
      receivedByA.push(event);
    });
    bus.subscribe((event) => {
      receivedByB.push(event);
    });

    await bus.publish(connectorRegisteredEvent());

    expect(receivedByA).toHaveLength(1);
    expect(receivedByB).toHaveLength(1);
  });

  it('never calls a subscriber before it subscribed', async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];

    await bus.publish(connectorRegisteredEvent());
    bus.subscribe((event) => {
      received.push(event);
    });

    expect(received).toHaveLength(0);
  });

  it('stops calling a subscriber once it unsubscribes', async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];
    const unsubscribe = bus.subscribe((event) => {
      received.push(event);
    });

    unsubscribe();
    await bus.publish(connectorRegisteredEvent());

    expect(received).toHaveLength(0);
  });

  it('awaits an async subscriber before publish() resolves', async () => {
    const bus = new InMemoryEventBus();
    let handled = false;
    bus.subscribe(async () => {
      await Promise.resolve();
      handled = true;
    });

    await bus.publish(connectorRegisteredEvent());

    expect(handled).toBe(true);
  });
});
