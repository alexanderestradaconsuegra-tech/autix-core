import { toConnectorId, type ConnectorManifest } from '@autix/contracts';
import type { Registry } from '@autix/core';
import type { FastifyInstance } from 'fastify';

import { errorCodeToHttpStatus, toErrorShape } from '../http-error-mapping.js';

/**
 * `ConnectorManifest` (RFC-000 §13) es la única forma real de "un Connector"
 * que el dominio conoce hoy: `connectorId`, `version`, y las Tools que
 * publica. No hay `category`/`status` de conexión persistido/`lastSyncAt`/
 * `description` a nivel Connector — RC2 Fase 1 expone exactamente lo que
 * existe, sin inventar esos campos para la UI.
 */
function toConnectorResponse(manifest: ConnectorManifest) {
  return {
    id: manifest.connectorId,
    version: manifest.version,
    toolCount: manifest.tools.length,
    tools: manifest.tools.map((tool) => ({
      id: tool.id,
      implementsCapability: tool.implementsCapability,
      riskLevel: tool.riskLevel,
      description: tool.description,
    })),
  };
}

/**
 * `GET /v1/connectors` (RC2 Fase 1, Studio Live Platform): lista los
 * Connectors registrados — expone `Registry.listConnectors()`, que ya
 * existía desde Sprint 3 sin ningún endpoint HTTP que lo sirviera (solo
 * `POST /v1/connectors/register` para el alta).
 */
export function registerListConnectorsRoute(app: FastifyInstance, registry: Registry): void {
  app.get('/v1/connectors', async (_request, reply) => {
    const connectors = registry.listConnectors().map(toConnectorResponse);
    await reply.status(200).send({ connectors });
  });
}

/** `GET /v1/connectors/:connectorId` — el detalle de un único Connector, vía `Registry.getConnector()`. */
export function registerGetConnectorRoute(app: FastifyInstance, registry: Registry): void {
  app.get<{ Params: { connectorId: string } }>(
    '/v1/connectors/:connectorId',
    async (request, reply) => {
      let connectorId;
      try {
        connectorId = toConnectorId(request.params.connectorId);
      } catch (error) {
        const shape = toErrorShape(error);
        await reply
          .status(errorCodeToHttpStatus(shape.code))
          .send({ success: false, error: shape });
        return;
      }

      try {
        const manifest = registry.getConnector(connectorId);
        await reply.status(200).send(toConnectorResponse(manifest));
      } catch (error) {
        const shape = toErrorShape(error);
        await reply
          .status(errorCodeToHttpStatus(shape.code))
          .send({ success: false, error: shape });
      }
    },
  );
}
