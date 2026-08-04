# @autix/schemas

El mecanismo para definir **canonical schemas** de Capabilities (RFC-001
§5, §10) y validar un input contra ellos (RFC-000 §14) — construido sobre
[Zod v4](https://zod.dev).

## Estado

✅ **Sprint 14.** Este paquete todavía no define ninguna Capability de
negocio concreta (eso llega con el primer Connector real) — expone la
herramienta para hacerlo. Sprint 14 agrega un segundo camino de
validación, `validateAgainstJsonSchema` (sobre [ajv](https://ajv.js.org/)),
para Tools/Capabilities registradas por wire (`@autix/core`,
`ConnectorManifestDocument`) — su schema real es JSON Schema puro, nunca un
`z.ZodType`, porque el Connector que lo publicó puede estar escrito en
cualquier lenguaje. `validateAgainstSchema` (Zod) sigue exactamente igual
para todo lo demás.

## Por qué Zod v4

Zod v4 agrega un `z.registry()` de primera clase para asociar metadata
(`id`, `title`, `description`) a un schema, y `z.toJSONSchema()` nativo que
usa esa metadata al exportar JSON Schema (Draft 2020-12) — verificado
directamente contra el paquete publicado, no asumido. Esto es exactamente
lo que RFC-001 §5 pide de un canonical schema: una definición única que da
el tipo estático (`z.infer`), el validador en runtime, y el JSON Schema que
va a alimentar el OpenAPI automático (RFC-000 §6) y, a futuro, los tool
schemas de MCP — sin una librería de conversión de por medio.

## Por qué ajv (Sprint 14)

Un Tool/Capability registrado por wire (`ConnectorManifestDocument`,
`@autix/core-server`) llega como JSON Schema — nunca puede traer un
`z.ZodType` real, porque el Connector que lo publicó puede estar escrito
en cualquier lenguaje, no solo TypeScript. [ajv](https://ajv.js.org/) es el
validador de JSON Schema de facto en el ecosistema Node — maduro, cumple
el spec, y ya viene con soporte para Draft 2020-12 (`Ajv2020`), el mismo
draft que `toJsonSchema()` ya emite desde Sprint 2. Es `dependency` (no
`peerDependency`): a diferencia de `zod`, ningún tipo público de
`@autix/contracts` expone un tipo de `ajv` — es un detalle de
implementación interno de este paquete.

## API

- **`defineCanonicalSchema(meta, schema)`** — registra `{ id, title,
description? }` para un schema y lo devuelve sin envolverlo (sigue siendo
  un `z.ZodType` usable directamente en un `CapabilityContract` de
  `@autix/contracts`).
- **`toJsonSchema(schema)`** — exporta un schema (registrado o no) a JSON
  Schema.
- **`validateAgainstSchema(schema, input)`** — valida `input` contra un
  `z.ZodType` sin lanzar: devuelve `{ success: true, data }` o
  `{ success: false, error }`, donde `error` ya es un `AutixErrorShape`
  (`code: 'VALIDATION_ERROR'`) de `@autix/contracts`, listo para responder
  al agente sin traducción adicional.
- **`validateAgainstJsonSchema(schema, input)`** (Sprint 14) — mismo
  `ValidationResult`, pero contra un JSON Schema puro (`Record<string,
unknown>`) en vez de un `z.ZodType`, usando `Ajv2020` (Draft 2020-12 — el
  mismo que emite `toJsonSchema()`). Usado por `ExecutionEngine`
  (`@autix/core`) cuando una Tool trae `inputJsonSchema`/`outputJsonSchema`
  (registrada por wire).
- **`compileJsonSchema(schema)`** — compila (y cachea, por instancia de
  schema) el validador de ajv de un JSON Schema; lanza si el schema en sí
  es inválido. `Registry.registerConnectorManifestDocument()`
  (`@autix/core`) lo llama en tiempo de **registro**, no de invocación —
  un Connector con un schema malformado se rechaza al registrarse.
- **`z`** — re-exportado desde este paquete para que todo el monorepo (y, a
  futuro, los Connectors) definan schemas contra la misma instancia de Zod,
  en vez de agregar `zod` como dependencia directa en cada lugar.

## Scripts

```sh
pnpm --filter @autix/schemas build      # compila a dist/ (ESM + .d.ts)
pnpm --filter @autix/schemas typecheck  # tsc --noEmit
pnpm --filter @autix/schemas test       # vitest run
```
