import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthenticatedRequest } from './auth-middleware.js';
import type { Database } from '../db.js';
import type { BuildServerDependencies } from '../server.js';
import { WorkflowRuntime } from '../runtime/workflow-runtime.js';

export function registerExecuteWorkflowRoute(app: FastifyInstance, deps: BuildServerDependencies): void {
  app.post<{
    Params: { workflowId: string };
    Body: Record<string, unknown>;
  }>('/v1/workflows/:workflowId/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const { workflowId } = request.params as { workflowId: string };
      const input = request.body || {};

      // Verify workflow exists
      const workflow = await deps.db.getWorkflow(workflowId, authRequest.auth.tenantId);
      if (!workflow) {
        reply.code(404).send({ error: 'Workflow not found' });
        return;
      }

      // Create execution record
      const execution = await deps.db.createExecution({
        tenant_id: authRequest.auth.tenantId,
        workflow_id: workflowId,
        agent_id: (input.agentId as string | undefined) || null,
        status: 'running',
        input: input as Record<string, unknown>,
        output: null,
        error_message: null,
        steps_executed: [],
        duration_ms: null,
      });

      // Execute workflow using Runtime
      try {
        const runtime = new WorkflowRuntime({
          registry: deps.registry,
          connectors: deps.connectors,
          executionEngine: deps.executionEngine,
          db: deps.db,
        });

        await runtime.execute(workflowId, execution.id, authRequest.auth.tenantId);

        // Fetch updated execution
        const updatedExecution = await getExecutionWithDb(execution.id, authRequest.auth.tenantId, deps.db);

        reply.code(201).send({
          executionId: execution.id,
          workflowId,
          status: updatedExecution?.status || 'success',
          duration: updatedExecution?.duration_ms,
          output: updatedExecution?.output,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Workflow execution error:', errorMsg);

        reply.code(500).send({
          error: 'Workflow execution failed',
          executionId: execution.id,
          details: errorMsg,
        });
      }
    } catch (error) {
      console.error('Execute workflow error:', error);
      reply.code(500).send({ error: 'Failed to execute workflow' });
    }
  });
}

export function registerListExecutionsRoute(app: FastifyInstance, db: Database): void {
  app.get<{
    Params: { workflowId: string };
    Querystring: { limit?: string };
  }>('/v1/workflows/:workflowId/executions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const { workflowId } = request.params as { workflowId: string };
      const limit = Math.min(parseInt((request.query as { limit?: string }).limit || '50'), 100);

      // Verify workflow exists
      const workflow = await db.getWorkflow(workflowId, authRequest.auth.tenantId);
      if (!workflow) {
        reply.code(404).send({ error: 'Workflow not found' });
        return;
      }

      const executions = await db.listExecutions(workflowId, authRequest.auth.tenantId, limit);

      reply.send({
        workflowId,
        executions,
        count: executions.length,
      });
    } catch (error) {
      console.error('List executions error:', error);
      reply.code(500).send({ error: 'Failed to list executions' });
    }
  });
}

export function registerGetExecutionRoute(app: FastifyInstance, db: Database): void {
  app.get<{
    Params: { executionId: string };
  }>('/v1/executions/:executionId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const { executionId } = request.params as { executionId: string };

      const execution = await getExecutionWithDb(executionId, authRequest.auth.tenantId, db);
      if (!execution) {
        reply.code(404).send({ error: 'Execution not found' });
        return;
      }

      reply.send(execution);
    } catch (error) {
      console.error('Get execution error:', error);
      reply.code(500).send({ error: 'Failed to get execution' });
    }
  });
}

// Helper function
async function getExecutionWithDb(id: string, tenantId: string, db: Database) {
  return db.getExecution(id, tenantId);
}
