/**
 * @autix/contracts
 *
 * Contratos de Autix Core (RFC-000 §7-§8, §15, §21; RFC-001 §4-§5):
 * identificadores branded, nivel de riesgo, el modelo de errores común, y
 * las formas de Tool Contract, Capability Contract y Connector Manifest.
 *
 * Cero I/O, cero lógica de negocio, cero dependencia de ningún Connector
 * concreto — es vocabulario compartido, no implementación.
 */

export type { Brand } from './ids.js';
export {
  type ToolId,
  toToolId,
  type CapabilityId,
  toCapabilityId,
  type ConnectorId,
  toConnectorId,
  type TenantId,
  toTenantId,
  type WorkflowId,
  toWorkflowId,
  type AgentId,
  toAgentId,
  type PrincipalId,
  toPrincipalId,
} from './ids.js';

export { RISK_LEVELS, type RiskLevel, isRiskLevel } from './risk-level.js';

export {
  ERROR_CODES,
  type ErrorCode,
  isErrorCode,
  type AutixErrorShape,
  AutixError,
} from './errors.js';

export type { RateLimitPolicy } from './rate-limit.js';
export type { ToolExample } from './tool-example.js';
export type { JsonSchemaDocument } from './json-schema-document.js';
export type { CapabilityContract } from './capability-contract.js';
export type { ToolContract } from './tool-contract.js';
export type { ConnectorManifest } from './connector-manifest.js';
export type { AgentContract } from './agent-contract.js';
export type { MarketplaceItemContract } from './marketplace-contract.js';
export type {
  ConnectorManifestDocument,
  ConnectorManifestDocumentConnector,
  ConnectorManifestDocumentPublisher,
  ConnectorManifestDocumentEndpoint,
  CapabilityManifestEntry,
  ToolManifestEntry,
} from './connector-manifest-document.js';
export type {
  WorkflowContract,
  WorkflowStep,
  WorkflowStepCompensation,
  WorkflowRetryPolicy,
  WorkflowExecutionContext,
  WorkflowStepStatus,
  WorkflowStepOutcome,
} from './workflow-contract.js';

export type { Principal } from './principal.js';
export type { PolicyDecision } from './policy-decision.js';
export type { AuditEvent } from './audit-event.js';
export type { DomainEvent, DomainEventType } from './domain-event.js';

export { isValidSemver, compareSemver } from './semver.js';
