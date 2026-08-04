# @autix/cli

CLI de administración de Autix Core (RFC-000 §13: registro de Connectors,
inspección del Registry, etc.).

## Estado

🚧 **Sprint 1 (Foundation).** No existe todavía ningún comando real. El
único propósito de este paquete por ahora es probar que un binario ESM con
shebang se construye correctamente con `tsup`, queda marcado como
ejecutable, y resuelve en runtime sus dependencias de workspace
(`@autix/core`, `@autix/sdk`).

## Uso

```sh
pnpm --filter @autix/cli build
node packages/cli/dist/index.js
# => autix-core foundation ok — @autix/core@0.0.0 · @autix/sdk@0.0.0
```

El campo `bin` (`autix`) queda listo para cuando este paquete se instale
como dependencia de otro proyecto o se enlace globalmente (`pnpm link
--global`) — dentro de este mismo workspace, pnpm no crea un symlink de un
paquete hacia su propio binario, así que `pnpm --filter @autix/cli exec
autix` no lo resuelve. Para probarlo localmente, invoca el archivo
compilado directamente, como arriba.

## Dependencias del workspace

- `@autix/core` (`workspace:*`)
- `@autix/sdk` (`workspace:*`)

## Scripts

```sh
pnpm --filter @autix/cli build      # compila a dist/ (ESM + .d.ts, bin ejecutable)
pnpm --filter @autix/cli typecheck  # tsc --noEmit
pnpm --filter @autix/cli test       # vitest run
```
