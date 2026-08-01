import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from '../db.js';
import type { AuthenticatedRequest } from './auth-middleware.js';

export function registerDiscoverWorkflowsRoute(app: FastifyInstance, db: Database): void {
  app.get('/v1/workflows', async (request: FastifyRequest, reply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const workflows = await db.listWorkflows(authRequest.auth.tenantId);
      const response = workflows.map((w) => ({
        id: w.id,
        name: w.name,
        version: w.version,
        description: w.description,
        stepCount: w.steps.length,
        steps: w.steps,
      }));
      await reply.status(200).send({ workflows: response });
    } catch (error) {
      console.error('List workflows error:', error);
      await reply.status(500).send({ error: 'Failed to list workflows' });
    }
  });
}

export function registerGetWorkflowRoute(app: FastifyInstance, db: Database): void {
  app.get<{ Params: { workflowId: string } }>('/v1/workflows/:workflowId', async (request: FastifyRequest, reply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const { workflowId } = request.params as { workflowId: string };

      const workflow = await db.getWorkflow(workflowId, authRequest.auth.tenantId);
      if (!workflow) {
        await reply.status(404).send({ error: 'Workflow not found' });
        return;
      }

      const response = {
        id: workflow.id,
        name: workflow.name,
        version: workflow.version,
        description: workflow.description,
        stepCount: workflow.steps.length,
        steps: workflow.steps,
      };

      await reply.status(200).send(response);
    } catch (error) {
      console.error('Get workflow error:', error);
      await reply.status(500).send({ error: 'Failed to get workflow' });
    }
  });
}
