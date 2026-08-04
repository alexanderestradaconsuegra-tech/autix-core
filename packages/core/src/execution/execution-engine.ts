import { randomUUID } from 'node:crypto';

import {
  AutixError,
  type ConnectorId,
  type PolicyDecision,
  type Principal,
  type ToolContract,
  type ToolId,
} from '@autix/contracts';
import { validateAgainstJsonSchema, validateAgainstSchema } from '@autix/schemas';

import type { AuditSink } from '../audit/audit-sink.js';
import type { ConnectorDirectory } from '../connector/connector-directory.js';
import type { ConnectorInvokeRequest, ConnectorInvokeResult } from '../connector/connector-port.js';
import type { EventBus } from '../events/event-bus.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import type { Registry } from '../registry/registry.js';

export interface InvokeToolRequest {
  readonly toolId: ToolId;
  /** Sin especificar, el Registry resuelve la última versión (RFC-000 §21). */
  readonly version?: string;
  readonly input: unknown;
  readonly principal: Principal;
  readonly traceId: string;
  readonly idempotencyKey?: string;
}

/**
 * Política de reintento para Tools idempotentes (RFC-000 §14, Sprint 9).
 * `maxAttempts` incluye el primer intento (2 = un solo reintento).
 */
export interface RetryPolicy {
  readonly maxAttempts?: number;
  readonly delayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Sprint 14 (Capability Registry): una Tool registrada por wire
 * (`Registry.registerConnectorManifestDocument`) trae su schema real como
 * JSON Schema (`inputJsonSchema`/`outputJsonSchema`), no como Zod —
 * `inputSchema`/`outputSchema` son ahí un placeholder (`z.unknown()`, ver
 * `wire-conversion.ts`) que nunca debe usarse para validar. Se valida con
 * `ajv` cuando el campo JSON Schema está presente; si no, con Zod, exacto
 * como en todos los sprints anteriores — ningún Connector registrado en
 * proceso (tests, `apps/examples`) cambia de comportamiento.
 */
function validateToolInput(tool: ToolContract, input: unknown) {
  return tool.inputJsonSchema
    ? validateAgainstJsonSchema(tool.inputJsonSchema, input)
    : validateAgainstSchema(tool.inputSchema, input);
}

function validateToolOutput(tool: ToolContract, output: unknown) {
  return tool.outputJsonSchema
    ? validateAgainstJsonSchema(tool.outputJsonSchema, output)
    : validateAgainstSchema(tool.outputSchema, output);
}

/**
 * Dependencias del `ExecutionEngine` (Sprint 8: cinco Ports es demasiado
 * para argumentos posicionales — un objeto de dependencias es más legible
 * y evita errores de orden al construirlo).
 */
export interface ExecutionEngineDependencies {
  readonly registry: Registry;
  readonly connectors: ConnectorDirectory;
  readonly policyEngine: PolicyEngine;
  readonly auditSink: AuditSink;
  readonly eventBus: EventBus;
  /** Default: 3 intentos totales, 50ms de espera lineal entre reintentos. */
  readonly retry?: RetryPolicy;
}

/**
 * ExecutionEngine (RFC-000 §14): el pipeline real de invocación, sobre
 * `Registry` (Sprint 3) + `@autix/schemas` (Sprint 2) + `ConnectorPort`
 * (Sprint 4) + `PolicyEngine` (Sprint 6) + `AuditSink` (Sprint 7) +
 * `EventBus` (Sprint 8).
 *
 * Pasos de RFC-000 §14 que implementa, en este orden (el orden es el que
 * especifica el RFC — autorizar *después* de validar el input, no antes,
 * para no gastar una decisión de Policy Engine en algo que ni siquiera
 * tiene la forma correcta):
 * - **3** resolver Tool + versión (Registry) — sin `version`, la última
 *   por SemVer.
 * - **4** validar `input` contra el schema *nativo* de la Tool — si
 *   falla, ni el Policy Engine ni el Connector se llaman.
 * - **5** autorizar (`PolicyEngine.authorize`) — `deny` → `FORBIDDEN` +
 *   evento `PolicyDenied`, nunca se llega a enrutar.
 * - **6** `require_approval` → `APPROVAL_REQUIRED` + evento
 *   `ApprovalRequested`. El *canal* de aprobación (cómo un humano
 *   confirma, cómo se reanuda la invocación) no está definido todavía —
 *   RFC-000 lo marca como pregunta abierta, no como algo resuelto acá;
 *   esto solo devuelve la decisión y emite el evento.
 * - **7** enrutar al `ConnectorPort` correcto (`ConnectorDirectory`).
 * - **8** ejecutar, con reintento (Sprint 9): si la Tool es `idempotent` y
 *   el Connector responde `CONNECTOR_UNAVAILABLE` (fallo de transporte,
 *   nunca un error de negocio), se reintenta hasta `retry.maxAttempts`
 *   veces con una espera lineal (`retry.delayMs * intento`) — siempre con
 *   el mismo `idempotencyKey` (ver más abajo), para que el Connector
 *   pueda deduplicar. El circuit breaker por Connector (la otra guarda de
 *   este mismo paso) vive un nivel más abajo, como decorator de
 *   `ConnectorPort` (`CircuitBreakerConnectorPort`) — no lo aplica el
 *   `ExecutionEngine` automáticamente, lo elige quien registra el
 *   Connector en el `ConnectorDirectory`, porque no necesita saber nada
 *   de la Tool (a diferencia del reintento, que sí depende de
 *   `tool.idempotent`).
 * - **9** normalización — valida también el *output* contra lo que la
 *   Tool declaró; un output que no cumple es `CONNECTOR_ERROR`, nunca se
 *   pasa como si fuera válido.
 * - **10** auditoría y eventos — se registra un `AuditEvent` (siempre,
 *   vía `recordAndReturn`, el único punto de retorno real del método) y
 *   se publica un `DomainEvent`: `ToolFailed`/`PolicyDenied`/
 *   `ApprovalRequested` para cada camino de fallo (también dentro de
 *   `recordAndReturn`), y `ToolSucceeded` en el único camino de éxito,
 *   donde `tool.version`/`tool.connectorId` están garantizados sin
 *   necesitar un fallback inventado. `ToolInvoked` se emite aparte, al
 *   principio, antes de saber cómo termina.
 *
 * **`idempotencyKey`**: si el caller no mandó uno, se usa el propio
 * `invocationId` — sin esto, reintentar una invocación sin
 * `idempotencyKey` sería inseguro (el Connector no tendría forma de
 * detectar que es un reintento, no una invocación nueva).
 *
 * Pasos que **no** implementa todavía, a propósito (documentado, no
 * deuda): **2** (resolución de identidad/Capability Set — se asume que
 * `request.principal` ya llegó autenticado por una capa anterior, el
 * futuro Agent Gateway).
 */
export class ExecutionEngine {
  constructor(private readonly deps: ExecutionEngineDependencies) {}

  async invokeTool(request: InvokeToolRequest): Promise<ConnectorInvokeResult> {
    const invocationId = randomUUID();
    const startedAt = performance.now();
    const timestamp = (): string => new Date().toISOString();

    await this.deps.eventBus.publish({
      type: 'ToolInvoked',
      invocationId,
      timestamp: timestamp(),
      toolId: request.toolId,
      tenantId: request.principal.tenantId,
      principalId: request.principal.principalId,
      traceId: request.traceId,
    });

    /**
     * Único punto de retorno de fallos: registra el AuditEvent y, si
     * corresponde, publica el DomainEvent de fallo (PolicyDenied /
     * ApprovalRequested / ToolFailed). El camino de éxito no pasa por
     * acá — ver el `return` final, que emite `ToolSucceeded` con los
     * campos garantizados en vez de un `extra` opcional.
     */
    const recordFailureAndReturn = async (
      result: Extract<ConnectorInvokeResult, { success: false }>,
      extra: {
        toolVersion?: string;
        connectorId?: ConnectorId;
        decision?: PolicyDecision['decision'];
      } = {},
    ): Promise<ConnectorInvokeResult> => {
      await this.deps.auditSink.record({
        invocationId,
        timestamp: timestamp(),
        tenantId: request.principal.tenantId,
        principalId: request.principal.principalId,
        toolId: request.toolId,
        toolVersion: extra.toolVersion,
        connectorId: extra.connectorId,
        decision: extra.decision,
        outcome: 'failure',
        errorCode: result.error.code,
        durationMs: performance.now() - startedAt,
      });

      if (extra.decision === 'deny') {
        await this.deps.eventBus.publish({
          type: 'PolicyDenied',
          invocationId,
          timestamp: timestamp(),
          toolId: request.toolId,
          principalId: request.principal.principalId,
          reason: result.error.message,
        });
      } else if (extra.decision === 'require_approval') {
        await this.deps.eventBus.publish({
          type: 'ApprovalRequested',
          invocationId,
          timestamp: timestamp(),
          toolId: request.toolId,
          principalId: request.principal.principalId,
          reason: result.error.message,
        });
      } else {
        await this.deps.eventBus.publish({
          type: 'ToolFailed',
          invocationId,
          timestamp: timestamp(),
          toolId: request.toolId,
          errorCode: result.error.code,
          durationMs: performance.now() - startedAt,
        });
      }

      return result;
    };

    let tool;
    try {
      tool = this.deps.registry.getTool(request.toolId, request.version);
    } catch (error) {
      if (error instanceof AutixError) {
        return recordFailureAndReturn({ success: false, error: error.toShape() });
      }
      throw error;
    }

    const inputValidation = validateToolInput(tool, request.input);
    if (!inputValidation.success) {
      return recordFailureAndReturn(
        { success: false, error: inputValidation.error },
        { toolVersion: tool.version, connectorId: tool.connectorId },
      );
    }

    const decision = this.deps.policyEngine.authorize(request.principal, tool);
    if (decision.decision === 'deny') {
      return recordFailureAndReturn(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: decision.reason,
            details: { toolId: tool.id, principalId: request.principal.principalId },
          },
        },
        { toolVersion: tool.version, connectorId: tool.connectorId, decision: decision.decision },
      );
    }
    if (decision.decision === 'require_approval') {
      return recordFailureAndReturn(
        {
          success: false,
          error: {
            code: 'APPROVAL_REQUIRED',
            message: decision.reason,
            details: { toolId: tool.id, principalId: request.principal.principalId },
          },
        },
        { toolVersion: tool.version, connectorId: tool.connectorId, decision: decision.decision },
      );
    }

    const connector = this.deps.connectors.resolve(tool.connectorId);
    if (!connector) {
      return recordFailureAndReturn(
        {
          success: false,
          error: {
            code: 'CONNECTOR_UNAVAILABLE',
            message: `No hay un Connector activo para "${tool.connectorId}".`,
            details: { connectorId: tool.connectorId, toolId: tool.id },
          },
        },
        { toolVersion: tool.version, connectorId: tool.connectorId, decision: decision.decision },
      );
    }

    const connectorRequest: ConnectorInvokeRequest = {
      toolId: tool.id,
      // Se envía la versión ya resuelta, nunca "la que pidió el caller" —
      // si vino sin especificar, el Connector debe saber exactamente cuál
      // se ejecutó, no que "se pidió la última".
      version: tool.version,
      input: inputValidation.data,
      context: {
        tenantId: request.principal.tenantId,
        traceId: request.traceId,
        // Sin uno provisto, se reusa el invocationId — un reintento sin
        // idempotencyKey no es seguro (el Connector no podría deduplicar).
        idempotencyKey: request.idempotencyKey ?? invocationId,
      },
    };

    const maxAttempts = this.deps.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const retryDelayMs = this.deps.retry?.delayMs ?? DEFAULT_RETRY_DELAY_MS;

    let invokeResult = await connector.invoke(connectorRequest);
    for (
      let attempt = 1;
      tool.idempotent &&
      !invokeResult.success &&
      invokeResult.error.code === 'CONNECTOR_UNAVAILABLE' &&
      attempt < maxAttempts;
      attempt += 1
    ) {
      await sleep(retryDelayMs * attempt);
      invokeResult = await connector.invoke(connectorRequest);
    }

    if (!invokeResult.success) {
      return recordFailureAndReturn(invokeResult, {
        toolVersion: tool.version,
        connectorId: tool.connectorId,
        decision: decision.decision,
      });
    }

    const outputValidation = validateToolOutput(tool, invokeResult.output);
    if (!outputValidation.success) {
      return recordFailureAndReturn(
        {
          success: false,
          error: {
            code: 'CONNECTOR_ERROR',
            message: `El Connector "${tool.connectorId}" devolvió un output que no cumple el schema de "${tool.id}".`,
            details: {
              toolId: tool.id,
              connectorId: tool.connectorId,
              issues: outputValidation.error.details,
            },
          },
        },
        { toolVersion: tool.version, connectorId: tool.connectorId, decision: decision.decision },
      );
    }

    const durationMs = performance.now() - startedAt;
    await this.deps.auditSink.record({
      invocationId,
      timestamp: timestamp(),
      tenantId: request.principal.tenantId,
      principalId: request.principal.principalId,
      toolId: request.toolId,
      toolVersion: tool.version,
      connectorId: tool.connectorId,
      decision: decision.decision,
      outcome: 'success',
      durationMs,
    });
    await this.deps.eventBus.publish({
      type: 'ToolSucceeded',
      invocationId,
      timestamp: timestamp(),
      toolId: request.toolId,
      toolVersion: tool.version,
      connectorId: tool.connectorId,
      durationMs,
    });

    return { success: true, output: outputValidation.data };
  }
}
