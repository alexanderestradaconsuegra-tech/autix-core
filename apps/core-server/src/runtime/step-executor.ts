import type { ContextManager } from './context-manager.js';
import type { ParsedWorkflowStep, ExecutionBatch } from './workflow-parser.js';
import type { ToolInvoker, ToolExecutionResult } from './tool-invoker.js';

export interface StepExecutionResult {
  stepId: string;
  toolId: string;
  status: 'success' | 'error';
  output?: unknown;
  error?: {
    code: string;
    message: string;
  };
  duration_ms: number;
  executedAt: Date;
}

/**
 * Ejecuta un paso individual o un batch de pasos en paralelo
 */
export class StepExecutor {
  constructor(
    private toolInvoker: ToolInvoker,
    private context: ContextManager,
  ) {}

  async executeStep(
    step: ParsedWorkflowStep,
    tenantId: string,
    executionId: string,
  ): Promise<StepExecutionResult> {
    const stepId = step.id;

    try {
      // 1. Resolver inputs usando ContextManager
      const inputMapping = step.inputMapping || {};
      const resolvedInputs = this.context.resolveInput(inputMapping) as Record<string, unknown>;

      // 2. Log que estamos empezando
      this.context.addLog(stepId, 'info', `Iniciando ejecución de step: ${step.toolId}`, {
        connectorId: step.connectorId,
        inputs: resolvedInputs,
      });

      // 3. Ejecutar la herramienta
      const toolResult = await this.toolInvoker.invokeTool(
        step.toolId,
        step.connectorId,
        resolvedInputs,
        tenantId,
        executionId,
        stepId,
      );

      // 4. Guardar output en contexto
      if (toolResult.status === 'success') {
        this.context.setStepOutput(stepId, toolResult.output);
        this.context.addLog(stepId, 'info', `Step ejecutado exitosamente`, {
          output: toolResult.output,
          duration_ms: toolResult.duration_ms,
        });
      } else {
        this.context.addLog(stepId, 'error', `Error en step: ${toolResult.error?.message}`, {
          error: toolResult.error,
        });
      }

      // 5. Retornar resultado
      return {
        stepId,
        toolId: step.toolId,
        status: toolResult.status,
        output: toolResult.output,
        error: toolResult.error,
        duration_ms: toolResult.duration_ms,
        executedAt: toolResult.executedAt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      this.context.addLog(stepId, 'error', `Excepción en step: ${errorMessage}`, { error });

      return {
        stepId,
        toolId: step.toolId,
        status: 'error',
        error: {
          code: 'STEP_EXECUTION_FAILED',
          message: errorMessage,
        },
        duration_ms: 0,
        executedAt: new Date(),
      };
    }
  }

  async executeBatch(
    batch: ExecutionBatch,
    steps: Map<string, ParsedWorkflowStep>,
    tenantId: string,
    executionId: string,
  ): Promise<StepExecutionResult[]> {
    // Ejecutar todos los steps del batch en paralelo
    const promises = batch.stepIds.map((stepId) => {
      const step = steps.get(stepId);
      if (!step) {
        throw new Error(`Step ${stepId} no encontrado`);
      }
      return this.executeStep(step, tenantId, executionId);
    });

    return Promise.all(promises);
  }
}
