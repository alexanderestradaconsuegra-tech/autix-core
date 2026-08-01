import type { ConnectorDirectory, ExecutionEngine, Registry } from '@autix/core';
import type { Database } from '../db.js';
import type { Workflow } from '../db.js';
import { ContextManager } from './context-manager.js';
import { StepExecutor } from './step-executor.js';
import { ToolInvoker } from './tool-invoker.js';
import { WorkflowParser } from './workflow-parser.js';

export interface WorkflowRuntimeDependencies {
  registry: Registry;
  connectors: ConnectorDirectory;
  executionEngine: ExecutionEngine;
  db: Database;
}

export interface ExecutionStats {
  stepsExecuted: number;
  stepsSucceeded: number;
  stepsFailed: number;
  totalDurationMs: number;
}

/**
 * Execution Runtime v1 - Orquestador principal
 * Coordina la ejecución completa de un workflow
 */
export class WorkflowRuntime {
  private registry: Registry;
  private connectors: ConnectorDirectory;
  private executionEngine: ExecutionEngine;
  private db: Database;

  constructor(deps: WorkflowRuntimeDependencies) {
    this.registry = deps.registry;
    this.connectors = deps.connectors;
    this.executionEngine = deps.executionEngine;
    this.db = deps.db;
  }

  async execute(workflowId: string, executionId: string, tenantId: string): Promise<void> {
    const runtimeStartTime = Date.now();

    try {
      // 1. Cargar workflow de BD
      const workflow = await this.db.getWorkflow(workflowId, tenantId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} no encontrado`);
      }

      // 2. Parsear workflow
      const parser = new WorkflowParser(this.registry);
      const parsed = parser.parse(workflow);

      // 3. Crear contexto
      const context = new ContextManager(workflowId, executionId, tenantId);

      // 4. Crear herramientas
      const toolInvoker = new ToolInvoker(this.registry, this.connectors, this.executionEngine);

      // 5. Crear executor
      const executor = new StepExecutor(toolInvoker, context);

      // 6. Mapear steps por ID
      const stepsById = new Map(parsed.steps.map((s) => [s.id, s]));

      // 7. Ejecutar cada batch
      const allResults: Array<{
        stepId: string;
        status: string;
        output?: unknown;
        error?: { code: string; message: string };
        duration_ms: number;
      }> = [];
      let hasErrors = false;

      for (const batch of parsed.executionPlan) {
        const batchResults = await executor.executeBatch(batch, stepsById, tenantId, executionId);

        for (const result of batchResults) {
          allResults.push({
            stepId: result.stepId,
            status: result.status,
            output: result.output,
            error: result.error,
            duration_ms: result.duration_ms,
          });

          if (result.status === 'error') {
            hasErrors = true;
          }
        }

        // Actualizar estado en BD en tiempo real
        await this.db.updateExecution(executionId, tenantId, {
          steps_executed: allResults,
          status: 'running',
        });

        // Si hubo error, detener la ejecución
        if (hasErrors) {
          break;
        }
      }

      // 8. Finalizar
      const totalDuration = Date.now() - runtimeStartTime;
      const snapshot = context.getSnapshot();

      const stats: ExecutionStats = {
        stepsExecuted: allResults.length,
        stepsSucceeded: allResults.filter((r) => r.status === 'success').length,
        stepsFailed: allResults.filter((r) => r.status === 'error').length,
        totalDurationMs: totalDuration,
      };

      // 9. Guardar ejecución completa
      await this.db.updateExecution(executionId, tenantId, {
        status: hasErrors ? 'failed' : 'success',
        steps_executed: allResults,
        output: snapshot,
        duration_ms: totalDuration,
      });

      // 10. Log final
      context.addLog('system', 'info', 'Ejecución completada', {
        status: hasErrors ? 'failed' : 'success',
        stats,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      const totalDuration = Date.now() - runtimeStartTime;

      // Guardar error
      await this.db.updateExecution(executionId, tenantId, {
        status: 'failed',
        error_message: errorMessage,
        duration_ms: totalDuration,
      });

      throw error;
    }
  }
}
