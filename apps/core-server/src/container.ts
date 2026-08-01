import {
  ExecutionEngine,
  InMemoryAuditSink,
  InMemoryConnectorDirectory,
  InMemoryEventBus,
  InMemoryRegistryStore,
  Registry,
  ScopePolicyEngine,
  type ConnectorDirectory,
} from '@autix/core';
import { createDatabaseClient, type Database } from './db.js';
import { createMockDatabase } from './db-mock.js';

/**
 * Dependencias del servidor. Sin Connectors reales registrados al
 * arrancar — desde Sprint 14, un Connector real se registra por red vía
 * `POST /v1/connectors/register` (ver `routes/register-connector.ts`);
 * antes de eso, el único camino era programático (tests) contra
 * `registry`/`connectors` directamente.
 */
export interface CoreServerDependencies {
  readonly registry: Registry;
  readonly connectors: ConnectorDirectory;
  readonly executionEngine: ExecutionEngine;
  readonly db: Database;
}

/** Composición por defecto: todas las implementaciones in-memory de `@autix/core`. */
export function createDefaultDependencies(): CoreServerDependencies {
  const eventBus = new InMemoryEventBus();
  const registry = new Registry(new InMemoryRegistryStore(), eventBus);
  const connectors = new InMemoryConnectorDirectory();

  const executionEngine = new ExecutionEngine({
    registry,
    connectors,
    policyEngine: new ScopePolicyEngine(),
    auditSink: new InMemoryAuditSink(),
    eventBus,
  });

  const db = createDatabaseClient();

  return { registry, connectors, executionEngine, db };
}

/** Composición para testing: usa mock database en-memory. */
export function createTestDependencies(): CoreServerDependencies {
  const eventBus = new InMemoryEventBus();
  const registry = new Registry(new InMemoryRegistryStore(), eventBus);
  const connectors = new InMemoryConnectorDirectory();

  const executionEngine = new ExecutionEngine({
    registry,
    connectors,
    policyEngine: new ScopePolicyEngine(),
    auditSink: new InMemoryAuditSink(),
    eventBus,
  });

  const db = createMockDatabase();

  return { registry, connectors, executionEngine, db };
}
