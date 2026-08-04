import type { ErrorCode } from './errors.js';
import type { ConnectorId, PrincipalId, TenantId, ToolId, WorkflowId } from './ids.js';

/**
 * Eventos de dominio (RFC-000 §18): efectos secundarios desacoplados de
 * la respuesta síncrona al agente (notificar por Telegram, actualizar un
 * dashboard, alimentar analítica) — nunca la ejecución de la Tool en sí,
 * que sigue siendo request/response.
 *
 * RFC-000 lista 8 tipos; este v0 implementa 6, los que tienen una
 * precondición real ya construida:
 *
 * - `ToolInvoked`/`ToolSucceeded`/`ToolFailed`/`PolicyDenied`/
 *   `ApprovalRequested`: el `ExecutionEngine` (Sprint 8) ya calcula estos
 *   resultados para la auditoría (Sprint 7) — emitirlos como evento es
 *   agregar un publish, no inventar lógica nueva.
 * - `ConnectorRegistered`: el `Registry` (Sprint 3) ya sabe cuándo pasa.
 *
 * **No implementados, a propósito:**
 * - `ApprovalGranted` — no existe todavía un canal de aprobación que
 *   pueda *conceder* nada (ver RFC-000 "Riesgos abiertos"); emitir este
 *   evento sin esa precondición sería inventar un evento que nunca se
 *   dispara de verdad.
 * - `ConnectorDegraded` — requeriría un loop de monitoreo periódico
 *   llamando `healthCheck()`, que no existe (hoy solo se llama bajo
 *   demanda).
 *
 * Sprint 13 agrega 4 eventos de `WorkflowEngine` (RFC-001), mismo patrón
 * que los de Tool: `WorkflowStarted` al principio, exactamente uno de
 * `WorkflowSucceeded`/`WorkflowFailed` al final, y `WorkflowStepCompensated`
 * por cada compensación (patrón saga) que el motor ejecuta al fallar.
 */
export type DomainEvent =
  | {
      readonly type: 'ToolInvoked';
      readonly invocationId: string;
      readonly timestamp: string;
      readonly toolId: ToolId;
      readonly tenantId: TenantId;
      readonly principalId: PrincipalId;
      readonly traceId: string;
    }
  | {
      readonly type: 'ToolSucceeded';
      readonly invocationId: string;
      readonly timestamp: string;
      readonly toolId: ToolId;
      readonly toolVersion: string;
      readonly connectorId: ConnectorId;
      readonly durationMs: number;
    }
  | {
      readonly type: 'ToolFailed';
      readonly invocationId: string;
      readonly timestamp: string;
      readonly toolId: ToolId;
      readonly errorCode: ErrorCode;
      readonly durationMs: number;
    }
  | {
      readonly type: 'PolicyDenied';
      readonly invocationId: string;
      readonly timestamp: string;
      readonly toolId: ToolId;
      readonly principalId: PrincipalId;
      readonly reason: string;
    }
  | {
      readonly type: 'ApprovalRequested';
      readonly invocationId: string;
      readonly timestamp: string;
      readonly toolId: ToolId;
      readonly principalId: PrincipalId;
      readonly reason: string;
    }
  | {
      readonly type: 'ConnectorRegistered';
      readonly timestamp: string;
      readonly connectorId: ConnectorId;
      readonly version: string;
      readonly toolCount: number;
      /**
       * Sprint 14 (Capability Registry): cuántas Capabilities nuevas trajo
       * este registro. Opcional — `registerConnector` (registro en
       * proceso, sin Capabilities en su `ConnectorManifest`) no lo setea;
       * `registerConnectorManifestDocument` (registro por wire) sí.
       */
      readonly capabilityCount?: number;
    }
  | {
      readonly type: 'WorkflowStarted';
      readonly executionId: string;
      readonly timestamp: string;
      readonly workflowId: WorkflowId;
      readonly tenantId: TenantId;
      readonly principalId: PrincipalId;
      readonly traceId: string;
    }
  | {
      readonly type: 'WorkflowSucceeded';
      readonly executionId: string;
      readonly timestamp: string;
      readonly workflowId: WorkflowId;
      readonly durationMs: number;
    }
  | {
      readonly type: 'WorkflowFailed';
      readonly executionId: string;
      readonly timestamp: string;
      readonly workflowId: WorkflowId;
      readonly errorCode: ErrorCode;
      readonly durationMs: number;
    }
  | {
      readonly type: 'WorkflowStepCompensated';
      readonly executionId: string;
      readonly timestamp: string;
      readonly workflowId: WorkflowId;
      readonly stepId: string;
      readonly toolId: ToolId;
      readonly succeeded: boolean;
    };

export type DomainEventType = DomainEvent['type'];
