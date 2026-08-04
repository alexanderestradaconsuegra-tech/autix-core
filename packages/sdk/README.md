# @autix/sdk

SDK cliente para que agentes (Hermes u otros) y Connectors hablen con Autix
Core: descubrimiento, invocación de Capabilities/Tools, manejo de errores
tipados (RFC-000 §14-§15).

## Estado

🚧 **Sprint 1 (Foundation).** Este paquete todavía no expone ninguna
operación real. Solo re-exporta `@autix/core` para demostrar que la cadena
de dependencias `@autix/sdk → @autix/core → {@autix/contracts,
@autix/schemas}` resuelve correctamente de punta a punta.

## Dependencias del workspace

- `@autix/core` (`workspace:*`)

## Scripts

```sh
pnpm --filter @autix/sdk build      # compila a dist/ (ESM + .d.ts)
pnpm --filter @autix/sdk typecheck  # tsc --noEmit
pnpm --filter @autix/sdk test       # vitest run
```
