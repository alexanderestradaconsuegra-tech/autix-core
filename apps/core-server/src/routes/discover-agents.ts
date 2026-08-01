import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from '../db.js';
import type { AuthenticatedRequest } from './auth-middleware.js';

export function registerListAgentsRoute(fastify: FastifyInstance, db: Database): void {
  fastify.get<{ Reply: { agents: unknown[] } }>('/v1/agents', async (request: FastifyRequest, reply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const agents = await db.listAgents(authRequest.auth.tenantId);
      await reply.status(200).send({ agents });
    } catch (error) {
      console.error('List agents error:', error);
      await reply.status(500).send({ error: 'Failed to list agents' });
    }
  });
}

export function registerGetAgentRoute(fastify: FastifyInstance, db: Database): void {
  fastify.get<{ Params: { id: string } }>('/v1/agents/:id', async (request: FastifyRequest, reply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      const agent = await db.getAgent(id, authRequest.auth.tenantId);
      if (!agent) {
        await reply.status(404).send({ error: 'Agent not found' });
        return;
      }

      await reply.status(200).send(agent);
    } catch (error) {
      console.error('Get agent error:', error);
      await reply.status(500).send({ error: 'Failed to get agent' });
    }
  });
}
