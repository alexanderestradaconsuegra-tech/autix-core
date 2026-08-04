import { randomUUID } from 'node:crypto';

import {
  AutixError,
  type AutixErrorShape,
  type Principal,
  type ToolContract,
  type WorkflowContract,
  type WorkflowExecutionContext,
  type WorkflowId,
  type WorkflowStep,
  type WorkflowStepOutcome,
} from '@autix/contracts';
import { validateAgainstSchema } from '@autix/schemas';

import type { ConnectorInvokeResult } from '../connector/connector-port.js';
import type { EventBus } from '../events/event-bus.js';
import type { ExecutionEngine } from '../execution/execution-engine.js';
import type { Registry } from '../registry/registry.js';

export interface ExecuteWorkflowRequest {
  readonly workflowId: WorkflowId;
  readonly version?: string;
  readonly input: unknown;
  readonly principal: Principal;
  readonly traceId: string;
}

export type WorkflowExecutionResult =
  | {
      readonly success: true;
      readonly output: unknown;
      readonly steps: Readonly<Record<string, WorkflowStepOutcome>>;
    }
  | {
      readonly success: false;
      readonly error: AutixErrorShape;
      readonly steps: Readonly<Record<string, WorkflowStepOutcome>>;
      /** Steps que se compensaron (en orden inverso de ejecución), sin importar si la compensación en sí tuvo éxito. */
      readonly compensatedSteps: readonly string[];
    };

export interface WorkflowEngineDependencies {
  readonly registry: Registry;
  readonly executionEngine: ExecutionEngine;
  readonly eventBus: EventBus;
}

const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Acumulador mutable del `WorkflowExecutionContext` expuesto a
 * `condition`/`inputMapping`/`outputMapping`. Internamente mutable
 * (se actualiza tanda por tanda); la interfaz pública que ven las
 * funciones del autor del Workflow es de solo lectura.
 */
class MutableWorkflowContext implements WorkflowExecutionContext {
  readonly workflowInput: unknown;
  private readonly stepOutcomes = new Map<string, WorkflowStepOutcome>();

  constructor(workflowInput: unknown) {
    this.workflowInput = workflowInput;
  }

  get steps(): Readonly<Record<string, WorkflowStepOutcome>> {
    return Object.fromEntries(this.stepOutcomes);
  }

  record(stepId: string, outcome: WorkflowStepOutcome): void {
    this.stepOutcomes.set(stepId, outcome);
  }

  get(stepId: string): WorkflowStepOutcome | undefined {
    return this.stepOutcomes.get(stepId);
  }
}

/**
 * Resultado interno de ejecutar un step — el discriminante (`status`) vive
 * al tope del tipo (no anidado bajo `outcome`) para que TypeScript pueda
 * angostar `result.error` a partir de `result.status === 'failed'`.
 * `WorkflowStepOutcome` (el tipo público, en `@autix/contracts`) es más
 * angosto a propósito — no expone `error` a las funciones de mapping del
 * autor del Workflow.
 */
type StepRunResult =
  | { readonly stepId: string; readonly status: 'succeeded'; readonly output: unknown }
  | { readonly stepId: string; readonly status: 'skipped' }
  | { readonly stepId: string; readonly status: 'failed'; readonly error: AutixErrorShape };

/**
 * WorkflowEngine (RFC-001, Sprint 13): ejecuta un `WorkflowContract` — un
 * DAG de `WorkflowStep`s, no una lista lineal — con secuencia, ramas
 * condicionales y ejecución en paralelo desde esta primera versión.
 *
 * Cada step se ejecuta a través del `ExecutionEngine` ya existente
 * (`invokeTool()`), heredando gratis autorización (PolicyEngine),
 * auditoría (AuditSink) y reintento/circuit breaker por Connector
 * (Sprint 5-9) — el `WorkflowEngine` no reimplementa ninguna de esas
 * reglas, solo orquesta *cuándo* se llama a cada Tool.
 *
 * **Scheduling**: en cada tanda ("wave"), corren en paralelo (`Promise.all`)
 * todos los steps cuyas dependencias (`dependsOn`) ya fueron *procesadas*
 * (con cualquier resultado: éxito, fallo o salteado) — `parallelGroup` es
 * metadata descriptiva, no cambia el scheduling (ver `workflow-contract.ts`).
 * Un step con `condition` que evalúa `false` se saltea (nunca invoca su
 * Tool); sus dependientes de todos modos se consideran "listos" una vez
 * que el step se procesó — si un dependiente debe saltarse también cuando
 * su dependencia se salteó, su propio `condition` puede consultar
 * `context.steps[depId]?.status`. Es una decisión deliberada: no cascadear
 * el salteo automáticamente le da más control al autor del Workflow, en
 * vez de que el motor decida algo que no se le pidió explícitamente.
 *
 * **Transaccionalidad (saga)**: si un step falla (o el output final no
 * cumple `workflow.outputs`), el motor invoca la compensación
 * (`WorkflowStep.compensation`) de cada step ya exitoso, en orden inverso
 * de ejecución — nunca hace rollback de base de datos, solo invoca las
 * Tools de compensación que el propio Workflow declaró.
 *
 * **Output final**: RFC-001 no especifica cómo agregar el resultado de
 * múltiples steps en un único output — v0 usa una convención simple y
 * explícita, sin agregar campos nuevos al contrato: los steps *terminales*
 * (a los que ningún otro step declara `dependsOn`) exitosos aportan su
 * output, bajo su propio `id`, al objeto final (`{ [stepId]: output }`),
 * validado contra `workflow.outputs`.
 *
 * **Timeout**: `workflow.timeout` es un límite best-effort — antes de
 * programar cada tanda nueva se chequea el tiempo transcurrido; si se
 * excedió, no se programan más steps y se dispara compensación. No hay
 * cancelación real de una invocación ya en vuelo (`AbortSignal` no está
 * conectado hasta `ConnectorPort`/`HttpConnectorClient` todavía) —
 * documentado como límite conocido, no silencioso.
 *
 * **Reintento**: `workflow.retryPolicy` reintenta un step completo (no
 * solo la llamada HTTP — de nuevo `ExecutionEngine.invokeTool()`, que ya
 * tiene su propio reintento de Sprint 9) solo si la Tool es `idempotent` y
 * el fallo es `CONNECTOR_UNAVAILABLE` — mismo criterio de seguridad que
 * Sprint 9, un nivel más arriba. El mismo `idempotencyKey`
 * (`${executionId}:${stepId}`) se reusa en todos los intentos, tanto los
 * internos de `ExecutionEngine` como los de este nivel.
 */
export class WorkflowEngine {
  constructor(private readonly deps: WorkflowEngineDependencies) {}

  async executeWorkflow(request: ExecuteWorkflowRequest): Promise<WorkflowExecutionResult> {
    const executionId = randomUUID();
    const startedAt = performance.now();
    const timestamp = (): string => new Date().toISOString();

    await this.deps.eventBus.publish({
      type: 'WorkflowStarted',
      executionId,
      timestamp: timestamp(),
      workflowId: request.workflowId,
      tenantId: request.principal.tenantId,
      principalId: request.principal.principalId,
      traceId: request.traceId,
    });

    const fail = async (
      error: AutixErrorShape,
      context: MutableWorkflowContext,
      compensatedSteps: readonly string[],
    ): Promise<WorkflowExecutionResult> => {
      await this.deps.eventBus.publish({
        type: 'WorkflowFailed',
        executionId,
        timestamp: timestamp(),
        workflowId: request.workflowId,
        errorCode: error.code,
        durationMs: performance.now() - startedAt,
      });
      return { success: false, error, steps: context.steps, compensatedSteps };
    };

    let workflow: WorkflowContract;
    try {
      workflow = this.deps.registry.getWorkflow(request.workflowId, request.version);
    } catch (error) {
      if (error instanceof AutixError) {
        return fail(error.toShape(), new MutableWorkflowContext(request.input), []);
      }
      throw error;
    }

    const inputValidation = validateAgainstSchema(workflow.inputs, request.input);
    if (!inputValidation.success) {
      return fail(inputValidation.error, new MutableWorkflowContext(request.input), []);
    }

    const context = new MutableWorkflowContext(inputValidation.data);
    const stepsById = new Map(workflow.steps.map((step) => [step.id, step] as const));
    const pending = new Set(workflow.steps.map((step) => step.id));
    const executionOrder: string[] = [];

    let failure: { readonly error: AutixErrorShape } | undefined;

    while (pending.size > 0 && !failure) {
      if (workflow.timeout !== undefined && performance.now() - startedAt > workflow.timeout) {
        failure = {
          error: {
            code: 'TIMEOUT',
            message: `El Workflow "${workflow.id}" excedió su timeout de ${workflow.timeout}ms.`,
            details: { workflowId: workflow.id, timeout: workflow.timeout },
          },
        };
        break;
      }

      const readySteps = [...pending]
        .map((stepId) => stepsById.get(stepId))
        .filter(
          (step): step is WorkflowStep =>
            step !== undefined &&
            (step.dependsOn ?? []).every((depId) => context.get(depId) !== undefined),
        );

      if (readySteps.length === 0) {
        failure = {
          error: {
            code: 'INTERNAL_ERROR',
            message: `El Workflow "${workflow.id}" quedó bloqueado: ningún step listo con steps pendientes.`,
            details: { workflowId: workflow.id, pending: [...pending] },
          },
        };
        break;
      }

      const results = await Promise.all(
        readySteps.map((step) => this.runStep(workflow, step, context, request, executionId)),
      );

      for (const result of results) {
        pending.delete(result.stepId);

        if (result.status === 'succeeded') {
          context.record(result.stepId, { status: 'succeeded', output: result.output });
          executionOrder.push(result.stepId);
        } else if (result.status === 'skipped') {
          context.record(result.stepId, { status: 'skipped' });
        } else {
          context.record(result.stepId, { status: 'failed' });
          if (!failure) {
            failure = { error: result.error };
          }
        }
      }
    }

    if (!failure) {
      const rawOutput = this.computeAggregateOutput(workflow, context);
      const outputValidation = validateAgainstSchema(workflow.outputs, rawOutput);
      if (outputValidation.success) {
        await this.deps.eventBus.publish({
          type: 'WorkflowSucceeded',
          executionId,
          timestamp: timestamp(),
          workflowId: workflow.id,
          durationMs: performance.now() - startedAt,
        });
        return { success: true, output: outputValidation.data, steps: context.steps };
      }
      failure = { error: outputValidation.error };
    }

    const compensatedSteps = await this.compensate(
      workflow,
      executionOrder,
      stepsById,
      context,
      request,
      executionId,
    );
    return fail(failure.error, context, compensatedSteps);
  }

  private async runStep(
    workflow: WorkflowContract,
    step: WorkflowStep,
    context: MutableWorkflowContext,
    request: ExecuteWorkflowRequest,
    executionId: string,
  ): Promise<StepRunResult> {
    if (step.condition && !step.condition(context)) {
      return { stepId: step.id, status: 'skipped' };
    }

    let tool: ToolContract;
    try {
      tool = this.deps.registry.getTool(step.toolId);
    } catch (error) {
      if (error instanceof AutixError) {
        return { stepId: step.id, status: 'failed', error: error.toShape() };
      }
      throw error;
    }

    if (step.connectorId !== undefined && step.connectorId !== tool.connectorId) {
      return {
        stepId: step.id,
        status: 'failed',
        error: {
          code: 'VALIDATION_ERROR',
          message: `El step "${step.id}" declara connectorId "${step.connectorId}", pero la Tool "${step.toolId}" pertenece a "${tool.connectorId}".`,
          details: {
            stepId: step.id,
            toolId: step.toolId,
            declaredConnectorId: step.connectorId,
            actualConnectorId: tool.connectorId,
          },
        },
      };
    }

    const stepInput = step.inputMapping(context);
    const idempotencyKey = `${executionId}:${step.id}`;
    const result = await this.invokeWithRetry(
      workflow,
      tool,
      step,
      stepInput,
      request,
      idempotencyKey,
    );

    if (!result.success) {
      return { stepId: step.id, status: 'failed', error: result.error };
    }

    const mappedOutput = step.outputMapping
      ? step.outputMapping(result.output, context)
      : result.output;
    return { stepId: step.id, status: 'succeeded', output: mappedOutput };
  }

  private async invokeWithRetry(
    workflow: WorkflowContract,
    tool: ToolContract,
    step: WorkflowStep,
    input: unknown,
    request: ExecuteWorkflowRequest,
    idempotencyKey: string,
  ): Promise<ConnectorInvokeResult> {
    const invoke = (): Promise<ConnectorInvokeResult> =>
      this.deps.executionEngine.invokeTool({
        toolId: step.toolId,
        input,
        principal: request.principal,
        traceId: request.traceId,
        idempotencyKey,
      });

    let result = await invoke();

    const retryPolicy = workflow.retryPolicy;
    if (!retryPolicy || !tool.idempotent) {
      return result;
    }

    const maxAttempts = retryPolicy.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS;
    const delayMs = retryPolicy.delayMs ?? DEFAULT_RETRY_DELAY_MS;

    for (
      let attempt = 1;
      !result.success && result.error.code === 'CONNECTOR_UNAVAILABLE' && attempt < maxAttempts;
      attempt += 1
    ) {
      await sleep(delayMs * attempt);
      result = await invoke();
    }

    return result;
  }

  private computeAggregateOutput(
    workflow: WorkflowContract,
    context: MutableWorkflowContext,
  ): Record<string, unknown> {
    const dependedOn = new Set<string>();
    for (const step of workflow.steps) {
      for (const dependencyId of step.dependsOn ?? []) {
        dependedOn.add(dependencyId);
      }
    }

    const output: Record<string, unknown> = {};
    for (const step of workflow.steps) {
      if (dependedOn.has(step.id)) continue;
      const outcome = context.get(step.id);
      if (outcome?.status === 'succeeded') {
        output[step.id] = outcome.output;
      }
    }
    return output;
  }

  private async compensate(
    workflow: WorkflowContract,
    executionOrder: readonly string[],
    stepsById: ReadonlyMap<string, WorkflowStep>,
    context: MutableWorkflowContext,
    request: ExecuteWorkflowRequest,
    executionId: string,
  ): Promise<readonly string[]> {
    const compensated: string[] = [];

    for (const stepId of [...executionOrder].reverse()) {
      const step = stepsById.get(stepId);
      const compensation = step?.compensation;
      if (!compensation) continue;

      const compensationInput = compensation.inputMapping(context);
      const result = await this.deps.executionEngine.invokeTool({
        toolId: compensation.toolId,
        input: compensationInput,
        principal: request.principal,
        traceId: request.traceId,
        idempotencyKey: `${executionId}:${stepId}:compensation`,
      });

      compensated.push(stepId);
      await this.deps.eventBus.publish({
        type: 'WorkflowStepCompensated',
        executionId,
        timestamp: new Date().toISOString(),
        workflowId: workflow.id,
        stepId,
        toolId: compensation.toolId,
        succeeded: result.success,
      });
    }

    return compensated;
  }
}
