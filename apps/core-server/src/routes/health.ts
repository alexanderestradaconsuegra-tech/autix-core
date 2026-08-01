import type { FastifyInstance } from 'fastify';

/** Liveness check simple — no depende de ningún Port (Registry, Connector, etc.). */
export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', () => Promise.resolve({ status: 'ok' as const }));
}
