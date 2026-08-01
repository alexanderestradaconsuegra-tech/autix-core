import { randomUUID } from 'node:crypto';

import {
  toPrincipalId,
  toTenantId,
  toToolId,
  type AutixErrorShape,
  type Principal,
} from '@autix/contracts';
import type { ExecutionEngine } from '@autix/core';
import type { FastifyInstance } from 'fastify';

import { errorCodeToHttpStatus } from '../http-error-mapping.js';

interface InvokeToolRequestBody {
  readonly version?: string;
  readonly input?: unknown;
  readonly principal?: {
    readonly principalId?: unknown;
    readonly tenantId?: unknown;
    readonly grantedScopes?: unknown;
  };
  readonly traceId?: string;
  readonly idempotencyKey?: string;
}

function validationError(message: string): AutixErrorShape {
  return { code: 'VALIDATION_ERROR', message };
}

/**
 * Reconstruye un `Principal` a partir del body crudo. Simplificación
 * deliberada de este sprint: no hay todavía autenticación real (RFC-000
 * §14 paso 2), así que el `Principal` viaja tal cual en el body — cuando
 * exista el Agent Gateway (MCP), será él quien resuelva la identidad real y
 * la pase al invocar esta API, no el propio caller.
 */
const MISSING_PRINCIPAL_MESSAGE =
  'El body debe incluir "principal" con principalId (string), tenantId (string) y grantedScopes (string[]).';

function parsePrincipal(
  body: InvokeToolRequestBody,
): { principal: Principal } | { error: AutixErrorShape } {
  const raw = body.principal;
  if (typeof raw !== 'object' || raw === null) {
    return { error: validationError(MISSING_PRINCIPAL_MESSAGE) };
  }

  const { principalId, tenantId, grantedScopes } = raw;
  if (typeof principalId !== 'string' || typeof tenantId !== 'string') {
    return { error: validationError(MISSING_PRINCIPAL_MESSAGE) };
  }
  if (
    !Array.isArray(grantedScopes) ||
    !grantedScopes.every((scope): scope is string => typeof scope === 'string')
  ) {
    return { error: validationError(MISSING_PRINCIPAL_MESSAGE) };
  }

  try {
    return {
      principal: {
        principalId: toPrincipalId(principalId),
        tenantId: toTenantId(tenantId),
        grantedScopes,
      },
    };
  } catch (error) {
    return { error: validationError(error instanceof Error ? error.message : String(error)) };
  }
}

export function registerInvokeToolRoute(
  app: FastifyInstance,
  executionEngine: ExecutionEngine,
): void {
  app.post<{ Params: { toolId: string }; Body: InvokeToolRequestBody }>(
    '/v1/tools/:toolId/invoke',
    async (request, reply) => {
      const body = request.body;

      if (typeof body !== 'object' || body === null || !('input' in body)) {
        const error = validationError('El body debe incluir "input".');
        await reply.status(errorCodeToHttpStatus(error.code)).send({ success: false, error });
        return;
      }

      const parsedPrincipal = parsePrincipal(body);
      if ('error' in parsedPrincipal) {
        await reply
          .status(errorCodeToHttpStatus(parsedPrincipal.error.code))
          .send({ success: false, error: parsedPrincipal.error });
        return;
      }

      let toolId;
      try {
        toolId = toToolId(request.params.toolId);
      } catch (error) {
        const shape = validationError(error instanceof Error ? error.message : String(error));
        await reply
          .status(errorCodeToHttpStatus(shape.code))
          .send({ success: false, error: shape });
        return;
      }

      const result = await executionEngine.invokeTool({
        toolId,
        version: body.version,
        input: body.input,
        principal: parsedPrincipal.principal,
        traceId: body.traceId ?? randomUUID(),
        idempotencyKey: body.idempotencyKey,
      });

      if (result.success) {
        await reply.status(200).send(result);
        return;
      }
      await reply.status(errorCodeToHttpStatus(result.error.code)).send(result);
    },
  );
}
