import type { FastifyInstance } from 'fastify';
import type { MarketplaceItemContract } from '@autix/contracts';
import { toConnectorId } from '@autix/contracts';
import type { Registry } from '@autix/core';

import { errorCodeToHttpStatus, toErrorShape } from '../http-error-mapping.js';

export function registerListMarketplaceItemsRoute(
  fastify: FastifyInstance,
  registry: Registry,
): void {
  fastify.get<{ Reply: { items: readonly MarketplaceItemContract[] } }>(
    '/v1/marketplace',
    async (_request, reply) => {
      const items = registry.discoverMarketplaceItems();
      await reply.status(200).send({ items });
    },
  );
}

export function registerGetMarketplaceItemRoute(fastify: FastifyInstance, registry: Registry): void {
  fastify.get<{ Params: { id: string } }>('/v1/marketplace/:id', async (request, reply) => {
    let connectorId;
    try {
      connectorId = toConnectorId(request.params.id);
    } catch (error) {
      const shape = toErrorShape(error);
      await reply.status(errorCodeToHttpStatus(shape.code)).send({ success: false, error: shape });
      return;
    }

    try {
      const item = registry.getMarketplaceItem(connectorId);
      await reply.status(200).send(item);
    } catch (error) {
      const shape = toErrorShape(error);
      await reply.status(errorCodeToHttpStatus(shape.code)).send({ success: false, error: shape });
    }
  });
}
