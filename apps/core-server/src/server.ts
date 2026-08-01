import type { ConnectorDirectory, ExecutionEngine, Registry } from '@autix/core';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Database } from './db.js';
import {
  registerDiscoverCapabilitiesRoute,
  registerGetCapabilityRoute,
} from './routes/discover-capabilities.js';
import {
  registerGetConnectorRoute,
  registerListConnectorsRoute,
} from './routes/discover-connectors.js';
import {
  registerDiscoverWorkflowsRoute,
  registerGetWorkflowRoute,
} from './routes/discover-workflows.js';
import { registerListAgentsRoute, registerGetAgentRoute } from './routes/discover-agents.js';
import { registerCreateAgentRoute, registerUpdateAgentRoute, registerDeleteAgentRoute } from './routes/manage-agents.js';
import { registerCreateWorkflowRoute, registerUpdateWorkflowRoute, registerDeleteWorkflowRoute } from './routes/manage-workflows.js';
import { registerExecuteWorkflowRoute, registerListExecutionsRoute, registerGetExecutionRoute } from './routes/execute-workflow.js';
import {
  registerListMarketplaceItemsRoute,
  registerGetMarketplaceItemRoute,
} from './routes/discover-marketplace.js';
import { registerHealthRoute } from './routes/health.js';
import { registerInvokeToolRoute } from './routes/invoke-tool.js';
import { registerRegisterConnectorRoute } from './routes/register-connector.js';
import { registerAuthMiddleware } from './routes/auth-middleware.js';

export interface BuildServerOptions {
  /** Default `false` — los tests no quieren el ruido de logs de Fastify. */
  readonly logger?: boolean;
  /** Skip authentication middleware registration (for testing). */
  readonly skipAuth?: boolean;
}

export interface BuildServerDependencies {
  readonly registry: Registry;
  readonly connectors: ConnectorDirectory;
  readonly executionEngine: ExecutionEngine;
  readonly db: Database;
}

/**
 * Arma la instancia de Fastify con las rutas de Sprint 10 y Sprint 14, sin
 * escuchar ningún puerto todavía (eso es responsabilidad de `index.ts`) —
 * así los tests pueden usar `app.inject()` sin abrir un socket real.
 */
export async function buildServer(
  deps: BuildServerDependencies,
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  // Register JWT authentication middleware (can be disabled for testing)
  if (!options.skipAuth) {
    await registerAuthMiddleware(app);
  } else {
    // For testing, add a simple middleware that provides test auth
    app.addHook('onRequest', async (request) => {
      const authRequest = request as any;
      if (!authRequest.auth) {
        authRequest.auth = {
          principalId: 'test-user',
          tenantId: 'test-tenant-e2e',
          token: 'test-token',
        };
      }
    });
  }

  registerHealthRoute(app);
  registerInvokeToolRoute(app, deps.executionEngine);
  registerRegisterConnectorRoute(app, deps.registry, deps.connectors);
  registerDiscoverCapabilitiesRoute(app, deps.registry);
  registerGetCapabilityRoute(app, deps.registry);
  registerDiscoverWorkflowsRoute(app, deps.db);
  registerGetWorkflowRoute(app, deps.db);
  registerCreateWorkflowRoute(app, deps.db);
  registerUpdateWorkflowRoute(app, deps.db);
  registerDeleteWorkflowRoute(app, deps.db);
  registerExecuteWorkflowRoute(app, deps);
  registerListExecutionsRoute(app, deps.db);
  registerGetExecutionRoute(app, deps.db);
  registerListConnectorsRoute(app, deps.registry);
  registerGetConnectorRoute(app, deps.registry);
  registerListAgentsRoute(app, deps.db);
  registerGetAgentRoute(app, deps.db);
  registerCreateAgentRoute(app, deps.db);
  registerUpdateAgentRoute(app, deps.db);
  registerDeleteAgentRoute(app, deps.db);
  registerListMarketplaceItemsRoute(app, deps.registry);
  registerGetMarketplaceItemRoute(app, deps.registry);

  return app;
}
