/**
 * @autix/core
 *
 * En sprints futuros este paquete contendrá el runtime completo de Autix
 * Core: Discovery, AuthN/AuthZ, Execution Engine, Policy Engine (RFC-000
 * §6, RFC-001 completa).
 *
 * - Sprint 3: el Tool/Connector **Registry** (RFC-000 §13, §21).
 * - Sprint 4: el **ConnectorPort** — cómo el Core invoca a un Connector
 *   out-of-process (RFC-000 §7), con `HttpConnectorClient` como
 *   implementación HTTP + JSON (decisión de transporte confirmada con el
 *   usuario).
 * - Sprint 5: el **ExecutionEngine** (RFC-000 §14) — une Registry +
 *   `@autix/schemas` + ConnectorPort en el pipeline real de invocación.
 * - Sprint 6: el **PolicyEngine** (RFC-000 §9, §11) — autorización basada
 *   en scopes, con el tercer estado `require_approval`.
 * - Sprint 7: el **AuditSink** (RFC-000 §16) — un `AuditEvent` por cada
 *   invocación, exitosa o no, nunca condicional.
 * - Sprint 8: el **EventBus** (RFC-000 §18) — eventos de dominio
 *   (`ToolInvoked`/`ToolSucceeded`/`ToolFailed`/`PolicyDenied`/
 *   `ApprovalRequested`/`ConnectorRegistered`) para efectos secundarios
 *   desacoplados de la respuesta síncrona al agente.
 * - Sprint 9: las dos guardas que faltaban del paso 8 de RFC-000 §14 —
 *   reintento de Tools idempotentes (dentro del `ExecutionEngine`, ver
 *   `RetryPolicy`) y **`CircuitBreakerConnectorPort`**, un decorator de
 *   `ConnectorPort` que cualquiera puede envolver alrededor de
 *   `HttpConnectorClient` (u otro) al registrarlo en el
 *   `ConnectorDirectory`.
 * - Sprint 13: el **`WorkflowEngine`** (RFC-001) — orquesta un DAG de
 *   `WorkflowStep`s (secuencia, ramas condicionales, paralelismo) sobre el
 *   `ExecutionEngine` ya existente, con compensación estilo saga
 *   (`compensable`/`compensatedBy`) cuando un step falla. El `Registry`
 *   ahora también descubre Workflows (`discoverWorkflows()`), espejo de
 *   `discoverTools()`.
 *
 * Ver `execution/execution-engine.ts` para el detalle exacto de qué pasos
 * del pipeline de RFC-000 §14 implementa, y `workflow/workflow-engine.ts`
 * para el algoritmo de ejecución del DAG.
 *
 * Re-exporta el resto del vocabulario de `@autix/contracts` que el runtime
 * del Core necesita (`RiskLevel`, `ErrorCode`). Depende de `@autix/schemas`
 * desde Sprint 5: el Execution Engine es el primer módulo que necesita
 * validar schemas de negocio, no solo manejar sus tipos.
 */

export { RISK_LEVELS, type RiskLevel, ERROR_CODES, type ErrorCode } from '@autix/contracts';

export type { RegistryStore } from './registry/registry-store.js';
export { InMemoryRegistryStore } from './registry/in-memory-registry-store.js';
export { Registry } from './registry/registry.js';
export type {
  CapabilityDiscoveryEntry,
  CapabilityImplementationRef,
} from './registry/capability-discovery.js';
export { parseConnectorManifestDocument } from './registry/connector-manifest-document-schema.js';

export type { TokenVerifier } from './identity/token-verifier.js';
export {
  JwksTokenVerifier,
  type JwksTokenVerifierOptions,
  type JwksTokenVerifierClaimMapping,
} from './identity/jwks-token-verifier.js';

export type {
  ConnectorPort,
  ConnectorHealthStatus,
  ConnectorHealthCheckResult,
  ConnectorInvokeContext,
  ConnectorInvokeRequest,
  ConnectorInvokeResult,
} from './connector/connector-port.js';
export {
  HttpConnectorClient,
  type HttpConnectorClientOptions,
} from './connector/http-connector-client.js';
export type { ConnectorDirectory } from './connector/connector-directory.js';
export { InMemoryConnectorDirectory } from './connector/in-memory-connector-directory.js';
export {
  CircuitBreakerConnectorPort,
  type CircuitBreakerOptions,
} from './connector/circuit-breaker-connector-port.js';

export type { PolicyEngine } from './policy/policy-engine.js';
export { ScopePolicyEngine } from './policy/scope-policy-engine.js';

export type { AuditSink } from './audit/audit-sink.js';
export { InMemoryAuditSink } from './audit/in-memory-audit-sink.js';

export type { DomainEventHandler, EventBus } from './events/event-bus.js';
export { InMemoryEventBus } from './events/in-memory-event-bus.js';

export {
  ExecutionEngine,
  type ExecutionEngineDependencies,
  type InvokeToolRequest,
  type RetryPolicy,
} from './execution/execution-engine.js';

export {
  WorkflowEngine,
  type WorkflowEngineDependencies,
  type ExecuteWorkflowRequest,
  type WorkflowExecutionResult,
} from './workflow/workflow-engine.js';

export const CORE_PACKAGE_NAME = '@autix/core';
export const CORE_PACKAGE_VERSION = '0.0.0';
