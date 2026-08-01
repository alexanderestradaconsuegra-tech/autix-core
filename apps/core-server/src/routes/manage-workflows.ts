import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database, WorkflowStep } from '../db.js';
import type { AuthenticatedRequest } from './auth-middleware.js';

export function registerCreateWorkflowRoute(app: FastifyInstance, db: Database): void {
  app.post<{
    Body: {
      name: string;
      description?: string;
      version?: string;
      steps?: WorkflowStep[];
      metadata?: Record<string, unknown>;
    };
  }>('/v1/workflows', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const { name, description, version = '1.0.0', steps = [], metadata = {} } = request.body;

      if (!name) {
        reply.code(400).send({ error: 'Missing required field: name' });
        return;
      }

      const workflow = await db.createWorkflow({
        tenant_id: authRequest.auth.tenantId,
        name,
        description: description || null,
        version,
        steps,
        metadata,
      });

      reply.code(201).send(workflow);
    } catch (error) {
      console.error('Create workflow error:', error);
      reply.code(500).send({ error: 'Failed to create workflow' });
    }
  });
}

export function registerUpdateWorkflowRoute(app: FastifyInstance, db: Database): void {
  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      steps?: WorkflowStep[];
      metadata?: Record<string, unknown>;
    };
  }>('/v1/workflows/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      const updated = await db.updateWorkflow(id, authRequest.auth.tenantId, {
        ...request.body,
      } as never);

      if (!updated) {
        reply.code(404).send({ error: 'Workflow not found' });
        return;
      }

      reply.send(updated);
    } catch (error) {
      console.error('Update workflow error:', error);
      reply.code(500).send({ error: 'Failed to update workflow' });
    }
  });
}

export function registerDeleteWorkflowRoute(app: FastifyInstance, db: Database): void {
  app.delete<{
    Params: { id: string };
  }>('/v1/workflows/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      const deleted = await db.deleteWorkflow(id, authRequest.auth.tenantId);

      if (!deleted) {
        reply.code(404).send({ error: 'Workflow not found' });
        return;
      }

      reply.code(204).send();
    } catch (error) {
      console.error('Delete workflow error:', error);
      reply.code(500).send({ error: 'Failed to delete workflow' });
    }
  });
}
