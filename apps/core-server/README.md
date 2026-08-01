# @autix/core-server

Servidor HTTP entrante de Autix Core (RFC-000 §14) — la puerta de entrada
por red al `ExecutionEngine` de `@autix/core`.

## Estado

🚧 **Sprint 14.** Sobre [Fastify](https://fastify.dev/) (framework de
servidor HTTP del Core, confirmado con el usuario). `POST
/v1/tools/:toolId/invoke` (Sprint 10) más un `GET /health` de liveness.
Sprint 14 agrega las dos piezas de la Capability Registry por red:
`POST /v1/connectors/register` — el endpoint entrante que RFC-000 §7
pedía desde Sprint 3 ("el registro fluye Connector → Core") — y `GET
/v1/capabilities`, el discovery capability-céntrico.

## Uso

```sh
pnpm --filter @autix/core-server build
pnpm --filter @autix/core-server start
# => Server listening at http://0.0.0.0:4000 (o $PORT)
```

```sh
curl -X POST http://localhost:4000/v1/tools/campolac.productos.consultar/invoke \
  -H 'content-type: application/json' \
  -d '{
    "input": { "nombre": "queso" },
    "principal": { "principalId": "agent-1", "tenantId": "campolac", "grantedScopes": ["productos:leer"] }
  }'
# { "success": true, "output": { ... } } | { "success": false, "error": { code, message, details? } }
```

Sin ningún Connector registrado por defecto (`createDefaultDependencies()`
arranca con un `Registry`/`ConnectorDirectory` vacíos). Desde Sprint 14, un
Connector real se registra por red — sin tocar código del Core — con un
solo `POST` a `/v1/connectors/register` (ver "API" más abajo). El camino
programático (registrar directo contra `registry`/`connectors`, sin pasar
por HTTP) sigue funcionando igual que antes, para tests o composición
in-process:

```ts
import { createDefaultDependencies, buildServer } from '@autix/core-server';
import { HttpConnectorClient } from '@autix/core';
import { toConnectorId } from '@autix/contracts';

const { registry, connectors, executionEngine } = createDefaultDependencies();

await registry.registerConnector(campolacManifest);
connectors.register(
  toConnectorId('campolac'),
  new HttpConnectorClient({ baseUrl: 'http://localhost:5000' }),
);

const app = buildServer({ registry, connectors, executionEngine }, { logger: true });
await app.listen({ port: 4000 });
```

## API

### `GET /health`

```json
{ "status": "ok" }
```

### `POST /v1/tools/:toolId/invoke`

Body:

```json
{
  "version": "1.0.0",
  "input": { "...": "..." },
  "principal": { "principalId": "...", "tenantId": "...", "grantedScopes": ["..."] },
  "traceId": "opcional — se genera uno si falta",
  "idempotencyKey": "opcional"
}
```

Envuelve `ExecutionEngine.invokeTool()` tal cual — esta capa solo traduce
HTTP (parseo del body, mapeo de `ErrorCode` → status) sin duplicar ninguna
regla de negocio. Respuesta: el mismo sobre simple que ya usa el
Connector Contract (Sprint 4) — `{ success: true, output }` o
`{ success: false, error: AutixErrorShape }` — consistencia deliberada
entre las dos fronteras HTTP del Core (saliente hacia Connectors, entrante
desde agentes).

`errorCodeToHttpStatus` (`src/http-error-mapping.ts`) mapea cada
`ErrorCode`:

| `ErrorCode`             | HTTP  |
| ----------------------- | ----- |
| `VALIDATION_ERROR`      | `400` |
| `UNAUTHORIZED`          | `401` |
| `FORBIDDEN`             | `403` |
| `APPROVAL_REQUIRED`     | `202` |
| `NOT_FOUND`             | `404` |
| `CONFLICT`              | `409` |
| `RATE_LIMITED`          | `429` |
| `CONNECTOR_UNAVAILABLE` | `503` |
| `CONNECTOR_ERROR`       | `502` |
| `INTERNAL_ERROR`        | `500` |

**Simplificación deliberada: el `Principal` viaja tal cual en el body.**
No existe todavía autenticación real (RFC-000 §14 paso 2) — se asume que
quien llama a esta API ya resolvió la identidad. `apps/agent-gateway`
(Sprint 11, MCP) ya resuelve un `Principal` para sus propios clientes MCP
vía `PrincipalResolver`, pero la identidad real por conexión (extensión
OAuth 2.1 de MCP) sigue pendiente de consulta — ver
`apps/agent-gateway/README.md`.

### `POST /v1/connectors/register`

Body: un `ConnectorManifestDocument` completo (`@autix/contracts`, Sprint 14) — JSON puro, ningún tipo de TypeScript. Ver
`packages/contracts/README.md` para el detalle campo por campo y
`packages/core/README.md` para las reglas de validación (integridad
referencial de Capabilities, compilación de JSON Schema con `ajv`,
todo-o-nada). Ejemplo mínimo:

```sh
curl -X POST http://localhost:4000/v1/connectors/register \
  -H 'content-type: application/json' \
  -d '{
    "protocolVersion": "1.0",
    "connector": { "id": "campolac", "version": "1.0.0", "endpoint": { "baseUrl": "http://localhost:4200" } },
    "capabilities": [{
      "id": "check_price_and_stock", "version": "1.0.0",
      "description": "Consulta precio y stock.", "riskLevel": "read", "compensable": false,
      "canonicalInputSchema": { "type": "object", "properties": { "producto": { "type": "string" } }, "required": ["producto"] },
      "canonicalOutputSchema": { "type": "object" }
    }],
    "tools": [{
      "id": "campolac.productos.consultar", "connectorId": "campolac", "version": "1.0.0",
      "implementsCapability": "check_price_and_stock",
      "description": "Consulta precio y stock.", "riskLevel": "read", "requiredScopes": [], "idempotent": true,
      "inputSchema": { "type": "object", "properties": { "producto": { "type": "string" } }, "required": ["producto"] },
      "outputSchema": { "type": "object" }
    }]
  }'
# 201 { "success": true }
```

Dos efectos, en orden: (1) `Registry.registerConnectorManifestDocument()`
indexa las Capabilities y Tools del documento; (2) si eso tuvo éxito, esta
ruta (no el `Registry`, que no sabe de transporte) resuelve el
`ConnectorPort` real vía `HttpConnectorClient` apuntando a
`connector.endpoint.baseUrl` y lo registra en el `ConnectorDirectory` — sin
este paso, el Connector quedaría descubrible pero no invocable. Probado
manualmente end-to-end contra el `@autix/campolac-connector` real
(Postgres real detrás): registro por wire → `GET /v1/capabilities` → `POST
/v1/tools/campolac.productos.consultar/invoke` → datos reales de vuelta,
sin ningún registro programático de por medio.

### `GET /v1/capabilities`

Discovery capability-céntrico (`Registry.discoverCapabilities()`): un
cliente descubre por `capabilityId`, sin conocer de antemano el nombre de
ningún Connector.

```json
{
  "capabilities": [
    {
      "id": "check_price_and_stock",
      "version": "1.0.0",
      "description": "...",
      "riskLevel": "read",
      "compensable": false,
      "compensatedBy": null,
      "canonicalInputSchema": { "...": "JSON Schema, siempre — ver nota abajo" },
      "canonicalOutputSchema": { "...": "..." },
      "implementations": [
        {
          "connectorId": "campolac",
          "toolId": "campolac.productos.consultar",
          "toolVersion": "1.0.0"
        }
      ]
    }
  ]
}
```

`canonicalInputSchema`/`canonicalOutputSchema` siempre viajan como JSON
Schema, sin importar cómo se registró la Capability: si llegó por wire ya
lo son; si se registró en proceso con Zod, esta ruta las convierte con
`toJsonSchema()` (`@autix/schemas`) antes de responder — un cliente externo
nunca necesita saber qué representación usó quien la registró.

## Deliberadamente fuera de este sprint

**Sin autenticación real ni TLS** — ver la nota de `Principal` arriba. Un
Connector que se registra por `POST /v1/connectors/register` tampoco se
autentica todavía — cualquiera que pueda alcanzar este endpoint puede
publicar Capabilities/Tools. Marketplace real (terceros publicando
Connectors) necesitará resolver esto antes de producción; el
`publisher`/`endpoint` del manifiesto ya tienen la forma para eso (ver
`@autix/contracts`), pero sin firma ni verificación todavía.

**El `Registry` de `apps/agent-gateway` sigue siendo una instancia
in-memory separada** de la de `core-server` — un Connector registrado acá
no aparece automáticamente en el Agent Gateway (MCP). Una implementación
real de `RegistryStore` compartida (Postgres/Supabase) resolvería esto sin
tocar ninguna regla de negocio del `Registry`; sigue siendo in-memory por
ahora, documentado, no oculto.

**Sin validación de schema a nivel de Fastify** (JSON Schema nativo vía
ajv, para el _envelope_ HTTP en sí). El envelope de `POST
/v1/tools/:toolId/invoke` (`principal`/`input`/`traceId`/`idempotencyKey`)
se valida a mano en `routes/invoke-tool.ts`; el de `POST
/v1/connectors/register` se valida con Zod (`parseConnectorManifestDocument`,
`@autix/core`) — no se introduce un tercer mecanismo de validación de
envelope. `ajv` sí se usa, pero para los schemas de **negocio** que un
manifiesto transporta (`inputSchema`/`outputSchema`/`canonicalInputSchema`/
`canonicalOutputSchema`), no para la forma del envelope HTTP.

## Dependencias del workspace

- `@autix/core` (`workspace:*`) — `ExecutionEngine`, `Registry`,
  `HttpConnectorClient`, `parseConnectorManifestDocument` y las
  implementaciones in-memory que arma `createDefaultDependencies()`.
- `@autix/contracts` (`workspace:*`) — `toPrincipalId`/`toTenantId`/
  `toToolId`/`toConnectorId` para reconstruir tipos branded desde el
  body/params, y `AutixError`/`AutixErrorShape` para el mapeo de errores.
- `@autix/schemas` (`workspace:*`, Sprint 14) — `toJsonSchema()`, para que
  `GET /v1/capabilities` siempre responda JSON Schema sin importar cómo se
  registró la Capability.
- `fastify` (`^5.10.0`) — el servidor HTTP en sí.
- `zod` (devDependency) — solo lo usan los tests, para construir
  `ToolContract`s de prueba con `z.object(...)`; el código de producción de
  este paquete no importa `zod` directamente.

## Scripts

```sh
pnpm --filter @autix/core-server build      # compila a dist/ (ESM, sin .d.ts — es una app)
pnpm --filter @autix/core-server start      # node dist/index.js, escucha en $PORT (default 4000)
pnpm --filter @autix/core-server typecheck  # tsc --noEmit
pnpm --filter @autix/core-server test       # vitest run (Fastify .inject(), sin abrir sockets)
```
