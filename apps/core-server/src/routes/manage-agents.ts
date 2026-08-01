import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from '../db.js';
import type { AuthenticatedRequest } from './auth-middleware.js';

export function registerCreateAgentRoute(app: FastifyInstance, db: Database): void {
  app.post<{
    Body: {
      name: string;
      description?: string;
      model: string;
      version?: string;
      capabilities?: string[];
      metadata?: Record<string, unknown>;
    };
  }>('/v1/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const { name, description, model, version = '1.0.0', capabilities = [], metadata = {} } = request.body;

      if (!name || !model) {
        reply.code(400).send({ error: 'Missing required fields: name, model' });
        return;
      }

      const agent = await db.createAgent({
        tenant_id: authRequest.auth.tenantId,
        name,
        description: description || null,
        version,
        model,
        capabilities,
        memory: {},
        metadata,
      });

      reply.code(201).send(agent);
    } catch (error) {
      console.error('Create agent error:', error);
      reply.code(500).send({ error: 'Failed to create agent' });
    }
  });
}

export function registerUpdateAgentRoute(app: FastifyInstance, db: Database): void {
  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      model?: string;
      capabilities?: string[];
      metadata?: Record<string, unknown>;
    };
  }>('/v1/agents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      const updated = await db.updateAgent(id, authRequest.auth.tenantId, {
        ...request.body,
      } as never);

      if (!updated) {
        reply.code(404).send({ error: 'Agent not found' });
        return;
      }

      reply.send(updated);
    } catch (error) {
      console.error('Update agent error:', error);
      reply.code(500).send({ error: 'Failed to update agent' });
    }
  });
}

export function registerDeleteAgentRoute(app: FastifyInstance, db: Database): void {
  app.delete<{
    Params: { id: string };
  }>('/v1/agents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      const deleted = await db.deleteAgent(id, authRequest.auth.tenantId);

      if (!deleted) {
        reply.code(404).send({ error: 'Agent not found' });
        return;
      }

      reply.code(204).send();
    } catch (error) {
      console.error('Delete agent error:', error);
      reply.code(500).send({ error: 'Failed to delete agent' });
    }
  });
}
