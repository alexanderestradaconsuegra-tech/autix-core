import type { ConnectorId } from '@autix/contracts';

import type { ConnectorDirectory } from './connector-directory.js';
import type { ConnectorPort } from './connector-port.js';

/** Implementación in-memory de `ConnectorDirectory` (Sprint 5). */
export class InMemoryConnectorDirectory implements ConnectorDirectory {
  private readonly connectors = new Map<ConnectorId, ConnectorPort>();

  register(connectorId: ConnectorId, port: ConnectorPort): void {
    this.connectors.set(connectorId, port);
  }

  resolve(connectorId: ConnectorId): ConnectorPort | undefined {
    return this.connectors.get(connectorId);
  }
}
