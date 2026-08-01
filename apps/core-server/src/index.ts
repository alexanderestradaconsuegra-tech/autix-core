/**
 * @autix/core-server
 *
 * Sprint 10: el servidor HTTP entrante del Core (RFC-000 §14), sobre
 * Fastify (framework de servidor HTTP confirmado con el usuario). Expone
 * `POST /v1/tools/:toolId/invoke`, que envuelve el `ExecutionEngine`
 * (Sprint 5-9) sin duplicar ninguna de sus reglas — esta capa solo traduce
 * HTTP (parseo del body, mapeo de `ErrorCode` a status HTTP) y nada más.
 *
 * Sprint 14 (Capability Registry) agrega el endpoint entrante que RFC-000
 * §7 pedía desde Sprint 3 ("el registro fluye Connector → Core"):
 * `POST /v1/connectors/register` recibe un `ConnectorManifestDocument`
 * (JSON puro, independiente del lenguaje del Connector — ver
 * `@autix/contracts`) y `GET /v1/capabilities` expone el discovery
 * capability-céntrico (`Registry.discoverCapabilities()`).
 */
import { createDefaultDependencies } from './container.js';
import { buildServer } from './server.js';

export { buildServer, type BuildServerOptions, type BuildServerDependencies } from './server.js';
export { createDefaultDependencies, type CoreServerDependencies } from './container.js';
export { errorCodeToHttpStatus } from './http-error-mapping.js';

export const CORE_SERVER_PACKAGE_NAME = '@autix/core-server';
export const CORE_SERVER_PACKAGE_VERSION = '0.0.0';

const DEFAULT_PORT = 4000;

async function main(): Promise<void> {
  const deps = createDefaultDependencies();
  const app = await buildServer(deps, { logger: true });

  const port = process.env['PORT'] ? Number(process.env['PORT']) : DEFAULT_PORT;
  await app.listen({ port, host: '0.0.0.0' });
}

const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
