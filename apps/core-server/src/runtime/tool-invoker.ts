import type { ConnectorDirectory, ExecutionEngine, Registry } from '@autix/core';

export interface ToolExecutionResult {
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
 * Resuelve y ejecuta herramientas contra conectores reales
 * - Busca la herramienta en el Registry
 * - Obtiene el conector correspondiente
 * - Ejecuta a través del ExecutionEngine
 */
export class ToolInvoker {
  constructor(
    private registry: Registry,
    private connectors: ConnectorDirectory,
    private executionEngine: ExecutionEngine,
  ) {}

  async invokeTool(
    toolId: string,
    connectorId: string,
    inputs: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    stepId: string,
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const startedAt = new Date();

    try {
      // 1. Resolver la herramienta en el Registry
      const tool = this.registry.getTool(toolId);

      // 2. Validar que connectorId es consistente
      if (tool.connectorId !== connectorId) {
        return {
          toolId,
          status: 'error',
          error: {
            code: 'CONNECTOR_MISMATCH',
            message: `Tool "${toolId}" pertenece a connector "${tool.connectorId}", pero se declaró "${connectorId}"`,
          },
          duration_ms: Date.now() - startTime,
          executedAt: startedAt,
        };
      }

      // 3. Obtener el conector
      const connector = this.connectors.resolve(connectorId);
      if (!connector) {
        return {
          toolId,
          status: 'error',
          error: {
            code: 'CONNECTOR_NOT_FOUND',
            message: `Connector "${connectorId}" no está registrado`,
          },
          duration_ms: Date.now() - startTime,
          executedAt: startedAt,
        };
      }

      // 4. Invocar a través del ExecutionEngine
      // Usar un Principal mock que incluya tenantId para auditoría
      const result = await this.executionEngine.invokeTool({
        toolId,
        input: inputs,
        principal: {
          principalId: 'workflow-executor',
          tenantId,
          type: 'system',
        },
        traceId: `${executionId}:${stepId}`,
        idempotencyKey: `${executionId}:${stepId}`,
      });

      const duration = Date.now() - startTime;

      if (result.success) {
        return {
          toolId,
          status: 'success',
          output: result.output,
          duration_ms: duration,
          executedAt: startedAt,
        };
      } else {
        return {
          toolId,
          status: 'error',
          error: {
            code: result.error.code,
            message: result.error.message,
          },
          duration_ms: duration,
          executedAt: startedAt,
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        toolId,
        status: 'error',
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Error desconocido',
        },
        duration_ms: duration,
        executedAt: startedAt,
      };
    }
  }
}
