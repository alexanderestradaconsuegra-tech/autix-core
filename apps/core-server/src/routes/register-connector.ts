import { toConnectorId } from '@autix/contracts';
import {
  HttpConnectorClient,
  parseConnectorManifestDocument,
  type ConnectorDirectory,
  type Registry,
} from '@autix/core';
import type { FastifyInstance } from 'fastify';

import { errorCodeToHttpStatus, toErrorShape } from '../http-error-mapping.js';

/**
 * `POST /v1/connectors/register` (Sprint 14, Capability Registry): el
 * endpoint entrante que RFC-000 §7 pedía desde Sprint 3 ("el registro fluye
 * Connector → Core") — un Connector, en cualquier lenguaje, publica su
 * `ConnectorManifestDocument` (JSON puro, `@autix/contracts`) acá.
 *
 * Dos efectos, en orden:
 * 1. `Registry.registerConnectorManifestDocument()` indexa sus Capabilities
 *    y Tools (todo-o-nada, ver `@autix/core`).
 * 2. Si el registro tuvo éxito, esta capa (no el `Registry` — que no sabe
 *    de transporte) también resuelve el `ConnectorPort` real vía
 *    `HttpConnectorClient` apuntando a `connector.endpoint.baseUrl` y lo
 *    registra en el `ConnectorDirectory` — sin este paso, el Connector
 *    quedaría descubrible pero no invocable.
 */
export function registerRegisterConnectorRoute(
  app: FastifyInstance,
  registry: Registry,
  connectors: ConnectorDirectory,
): void {
  app.post('/v1/connectors/register', async (request, reply) => {
    let document;
    try {
      document = parseConnectorManifestDocument(request.body);
    } catch (error) {
      const shape = toErrorShape(error);
      await reply.status(errorCodeToHttpStatus(shape.code)).send({ success: false, error: shape });
      return;
    }

    try {
      await registry.registerConnectorManifestDocument(document);
    } catch (error) {
      const shape = toErrorShape(error);
      await reply.status(errorCodeToHttpStatus(shape.code)).send({ success: false, error: shape });
      return;
    }

    connectors.register(
      toConnectorId(document.connector.id),
      new HttpConnectorClient({ baseUrl: document.connector.endpoint.baseUrl }),
    );

    await reply.status(201).send({ success: true });
  });
}
