# @autix/campolac-connector

El primer **Connector real** de Autix Core (RFC-000 §7, §22) — un proceso
HTTP fuera del Core, sobre el Postgres real de **Campolac OS** (distribuidora
mayorista de quesos artesanales).

## Estado

🚧 **Sprint 12.** Implementa el Connector Contract de Sprint 4 (HTTP +
JSON, `GET /healthz` + `POST /invoke`) con una única Tool:
`campolac.productos.consultar` — réplica exacta de la tool
`consultar_precio_stock` que ya usa el agente Hermes por n8n (ver
`../../campolac-hermes-guide.md` en la raíz del repo).

**Deliberadamente sin ninguna dependencia de `@autix/*`.** El Connector
Contract es un contrato de _protocolo_, no de código compartido — este
Connector prueba que cualquier proceso HTTP, en cualquier lenguaje, puede
implementarlo con solo conocer la forma del wire (`{toolId, input,
context}` → `{success, output}` / `{success, error}`).

## Requisitos para desarrollo local

Un Postgres real, con el schema real de Campolac (`campolac-schema.sql`,
en la raíz del repo — **nunca se modifica**, solo se aplica tal cual):

```sh
# Una vez, para crear la base y el usuario (mismos nombres que documenta
# campolac-hermes-guide.md):
sudo -u postgres psql -c "CREATE DATABASE campolac;"
sudo -u postgres psql -c "CREATE USER campolac_user WITH PASSWORD 'Campolac2026';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE campolac TO campolac_user;"
sudo -u postgres psql -d campolac -c "GRANT ALL ON SCHEMA public TO campolac_user;"

# Aplicar el schema real (desde la raíz del repo):
PGPASSWORD=Campolac2026 psql -h 127.0.0.1 -U campolac_user -d campolac -f campolac-schema.sql
```

`DATABASE_URL` (opcional) sobreescribe la cadena de conexión por defecto
(`postgres://campolac_user:Campolac2026@127.0.0.1:5432/campolac`). CI
(`.github/workflows/ci.yml`) levanta un servicio Postgres con estas mismas
credenciales y aplica el mismo schema antes de correr los tests — sin
mocks de base de datos en ningún lado.

## Uso

```sh
pnpm --filter @autix/campolac-connector build
pnpm --filter @autix/campolac-connector start
# => Server listening at http://0.0.0.0:4200 (o $PORT)
```

```sh
curl http://localhost:4200/healthz
# { "status": "ok" }

curl -X POST http://localhost:4200/invoke \
  -H 'content-type: application/json' \
  -d '{"toolId":"campolac.productos.consultar","input":{"producto":"queso"},"context":{"tenantId":"campolac","traceId":"t1"}}'
# { "success": true, "output": { "productos": [ ... datos reales de Postgres ... ] } }
```

## API

### `GET /healthz`

Chequea la conexión a Postgres (`SELECT 1`). `{ status: 'ok' }` o
`{ status: 'down', message }`.

### `POST /invoke`

Body: `{ toolId, version?, input, context }` (forma del Connector Contract,
Sprint 4). Solo implementa `campolac.productos.consultar` — cualquier otro
`toolId` devuelve `{ success: false, error: { code: 'NOT_FOUND', ... } }`
(HTTP 200: es una respuesta de aplicación válida, no un fallo de
transporte — igual convención que `HttpConnectorClient`, Sprint 4).

`input: { producto: string }` → `output: { productos: [{ nombre,
precioMayor, stockKg, unidad }] }`, la misma query SQL (`ILIKE`, mismo
orden, mismo límite de 10) que `consultar_precio_stock` en
`campolac-hermes-guide.md`.

## Ver también

`apps/examples` — el demo end-to-end que arma el `ConnectorManifest` del
lado del Core, registra este Connector real vía `HttpConnectorClient`, y
ejecuta una invocación real a través del `ExecutionEngine`.

## Dependencias

- `fastify` (`^5.10.0`) — el servidor HTTP.
- `pg` (`^8.22.0`) — cliente de Postgres.
- Nada de `@autix/*`, a propósito (ver "Estado" arriba).

## Scripts

```sh
pnpm --filter @autix/campolac-connector build      # compila a dist/ (ESM, sin .d.ts — es una app)
pnpm --filter @autix/campolac-connector start      # node dist/index.js, escucha en $PORT (default 4200)
pnpm --filter @autix/campolac-connector typecheck  # tsc --noEmit
pnpm --filter @autix/campolac-connector test       # vitest run — contra el Postgres real (ver "Requisitos" arriba)
```
