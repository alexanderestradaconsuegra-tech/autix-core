import { AutixError, toCapabilityId } from '@autix/contracts';
import type { CapabilityDiscoveryEntry, Registry } from '@autix/core';
import { toJsonSchema } from '@autix/schemas';
import type { FastifyInstance } from 'fastify';

import { errorCodeToHttpStatus, toErrorShape } from '../http-error-mapping.js';

/**
 * `canonicalInputSchema`/`canonicalOutputSchema` siempre viajan como JSON
 * Schema en la respuesta, sin importar cómo se registró la Capability: si
 * llegó por wire ya son JSON Schema (`canonicalInputJsonSchema`); si se
 * registró en proceso con Zod, se convierten acá con `toJsonSchema()`
 * (`@autix/schemas`, Sprint 2) — un cliente externo nunca necesita saber
 * qué representación usó quien la registró. Compartido entre el discovery
 * en bloque y el detalle por id (RC2 Fase 1) para no repetir el mapeo.
 */
function toCapabilityResponse(entry: CapabilityDiscoveryEntry) {
  return {
    id: entry.capability.id,
    version: entry.capability.version,
    description: entry.capability.description,
    riskLevel: entry.capability.riskLevel,
    compensable: entry.capability.compensable,
    compensatedBy: entry.capability.compensatedBy ?? null,
    canonicalInputSchema:
      entry.capability.canonicalInputJsonSchema ??
      toJsonSchema(entry.capability.canonicalInputSchema),
    canonicalOutputSchema:
      entry.capability.canonicalOutputJsonSchema ??
      toJsonSchema(entry.capability.canonicalOutputSchema),
    implementations: entry.implementations,
  };
}

/**
 * `GET /v1/capabilities` (Sprint 14, Capability Registry): discovery
 * capability-céntrico — un cliente (Agente, u otro servicio en cualquier
 * lenguaje) descubre por `capabilityId`, sin necesitar conocer de antemano
 * el nombre de ningún Connector (`Registry.discoverCapabilities()`).
 */
export function registerDiscoverCapabilitiesRoute(app: FastifyInstance, registry: Registry): void {
  app.get('/v1/capabilities', async (_request, reply) => {
    const capabilities = registry.discoverCapabilities().map(toCapabilityResponse);
    await reply.status(200).send({ capabilities });
  });
}

/**
 * `GET /v1/capabilities/:capabilityId` (RC2 Fase 1, Studio Live Platform):
 * el detalle de una única Capability — Studio lo necesita para su vista de
 * detalle sin tener que descargar el catálogo completo. Reusa
 * `discoverCapabilities()` (no un método nuevo del Registry) porque las
 * `implementations` de una Capability ya se calculan ahí; filtrar por id acá
 * evita duplicar esa lógica de cruce Capability↔Tool.
 */
export function registerGetCapabilityRoute(app: FastifyInstance, registry: Registry): void {
  app.get<{ Params: { capabilityId: string } }>(
    '/v1/capabilities/:capabilityId',
    async (request, reply) => {
      let capabilityId;
      try {
        capabilityId = toCapabilityId(request.params.capabilityId);
      } catch (error) {
        const shape = toErrorShape(error);
        await reply
          .status(errorCodeToHttpStatus(shape.code))
          .send({ success: false, error: shape });
        return;
      }

      const entry = registry
        .discoverCapabilities()
        .find((candidate) => candidate.capability.id === capabilityId);

      if (!entry) {
        const shape = toErrorShape(
          new AutixError('NOT_FOUND', `Capability "${capabilityId}" no está registrada.`, {
            capabilityId,
          }),
        );
        await reply
          .status(errorCodeToHttpStatus(shape.code))
          .send({ success: false, error: shape });
        return;
      }

      await reply.status(200).send(toCapabilityResponse(entry));
    },
  );
}
