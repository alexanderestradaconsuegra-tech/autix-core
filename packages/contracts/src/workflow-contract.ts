import type { z } from 'zod';

import type { ConnectorId, ToolId, WorkflowId } from './ids.js';

/**
 * Workflow Contract (RFC-001, Sprint 13): un proceso de negocio completo,
 * no una acción individual — orquesta múltiples `ToolContract`, de uno o
 * varios Connectors, como una única capacidad de alto nivel que el Agente
 * invoca sin ver la complejidad interna (RFC-001 "filosofía": no es un
 * flujo visual tipo n8n).
 *
 * El modelo interno es un **DAG** (`steps` + `dependsOn`), no una lista
 * lineal — soporta secuencia, ramas condicionales (`condition`) y
 * ejecución en paralelo (steps sin dependencia entre sí) desde la primera
 * versión. La ejecución real vive en `@autix/core`
 * (`workflow/workflow-engine.ts`); acá solo se define la *forma* del
 * contrato — igual separación que `ToolContract` (forma) vs
 * `ExecutionEngine` (ejecución).
 *
 * IDs legibles y estables (`campolac.crear-pedido`, no un UUID) — mismo
 * `WorkflowId` branded que ya existía desde Sprint 2, sin cambios.
 */
export interface WorkflowContract<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
> {
  readonly id: WorkflowId;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly inputs: Input;
  readonly outputs: Output;
  readonly steps: readonly WorkflowStep[];
  /** Milisegundos. Sin límite si se omite. */
  readonly timeout?: number;
  readonly retryPolicy?: WorkflowRetryPolicy;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Un nodo del DAG. Invoca una Tool concreta (`toolId`) de un Connector
 * concreto — el `WorkflowEngine` la resuelve vía `Registry.getTool()` y la
 * ejecuta a través del `ExecutionEngine` ya existente, heredando gratis
 * autorización, auditoría, reintento y circuit breaker (Sprint 5-9) — el
 * `WorkflowEngine` no duplica ninguna de esas reglas.
 *
 * `connectorId` es opcional y, cuando se declara, es una aserción (debe
 * coincidir con el `connectorId` real de la Tool resuelta) — no una forma
 * de elegir el Connector, porque `toolId` ya resuelve a una Tool concreta
 * con su propio Connector fijo. Se incluye igual, tal como pide la
 * especificación, para que cada paso documente a simple vista de qué
 * Connector depende sin tener que consultar el Registry.
 */
export interface WorkflowStep {
  readonly id: string;
  readonly toolId: ToolId;
  readonly connectorId?: ConnectorId;
  /** IDs de otros steps de este mismo Workflow que deben completarse antes. */
  readonly dependsOn?: readonly string[];
  /**
   * Rama condicional: si está presente y devuelve `false`, el step (y
   * transitivamente todo lo que dependa de él) se salta — no se invoca
   * ninguna Tool. Sin `condition`, el step siempre corre (si sus
   * dependencias se cumplieron).
   */
  readonly condition?: (context: WorkflowExecutionContext) => boolean;
  /**
   * Metadata descriptiva de qué steps corren en paralelo — la concurrencia
   * real la determina el DAG (`dependsOn`), no este campo: todo step cuyas
   * dependencias ya se completaron corre en la misma tanda concurrente que
   * cualquier otro step listo al mismo tiempo. `parallelGroup` documenta la
   * intención (p. ej. "notificaciones") para introspección/logging, no
   * cambia el scheduling.
   */
  readonly parallelGroup?: string;
  /**
   * Cómo deshacer este step si el Workflow falla más adelante (patrón
   * saga). El `WorkflowEngine` decide *cuándo* compensar (al fallar un
   * step, en orden inverso de éxito); esto declara *qué* Tool invocar y
   * con qué input, reusando `compensable`/`compensatedBy` de la Tool solo
   * como metadata informativa — la ejecución real de la compensación
   * siempre necesita saber cómo construir el input (normalmente a partir
   * del output de este mismo step), por eso es explícito acá y no un
   * simple booleano.
   */
  readonly compensation?: WorkflowStepCompensation;
  /** Construye el input nativo de la Tool a partir del contexto acumulado del Workflow. */
  readonly inputMapping: (context: WorkflowExecutionContext) => unknown;
  /**
   * Transforma el output crudo de la Tool antes de guardarlo en el
   * contexto (para que otros steps lo consuman ya en la forma que
   * necesitan). Sin `outputMapping`, se guarda el output tal cual.
   */
  readonly outputMapping?: (output: unknown, context: WorkflowExecutionContext) => unknown;
}

export interface WorkflowStepCompensation {
  readonly toolId: ToolId;
  readonly connectorId?: ConnectorId;
  readonly inputMapping: (context: WorkflowExecutionContext) => unknown;
}

/** Reintento a nivel Workflow — ver `WorkflowEngine` para la regla exacta (solo Tools idempotentes). */
export interface WorkflowRetryPolicy {
  readonly maxAttempts?: number;
  readonly delayMs?: number;
}

/**
 * Estado acumulado de una ejecución de Workflow en curso, expuesto a
 * `condition`/`inputMapping`/`outputMapping` — deliberadamente simple
 * (sin un lenguaje de expresiones/templating tipo n8n, RFC-001
 * "filosofía"): son funciones TypeScript comunes, igual que
 * `ToolContract.inputSchema` es un objeto Zod en proceso, no algo
 * serializado.
 */
export interface WorkflowExecutionContext {
  readonly workflowInput: unknown;
  readonly steps: Readonly<Record<string, WorkflowStepOutcome>>;
}

export type WorkflowStepStatus = 'succeeded' | 'failed' | 'skipped';

export interface WorkflowStepOutcome {
  readonly status: WorkflowStepStatus;
  readonly output?: unknown;
}
