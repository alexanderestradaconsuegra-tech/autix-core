# @autix/contracts

Contratos formales de Autix Core: identificadores branded, nivel de riesgo,
el modelo de errores común, y las formas de **Tool Contract**,
**Capability Contract**, **Connector Manifest**, **Workflow Contract** y
**Connector Manifest Document** (RFC-000 §7-§8, §15, §21; RFC-001 §4-§5,
Workflow Engine completo; Capability Registry, Sprint 14).

## Estado

✅ **Sprint 15.** Este paquete define el vocabulario real de tipos. Sigue
sin tener ningún tipo de I/O, ejecución, Registry ni Connector real — son
formas y validaciones puras, sin efectos secundarios.

## Contenido

- **IDs branded** (`ToolId`, `CapabilityId`, `ConnectorId`, `TenantId`,
  `WorkflowId`): en runtime son strings; a nivel de tipo, TypeScript impide
  pasar un `ConnectorId` donde se espera un `ToolId`. Se construyen con
  `toToolId(...)`, `toCapabilityId(...)`, etc. — lanzan si el valor es vacío.
- **`RiskLevel`** (RFC-001 §5): `'read' | 'write_reversible' |
'write_irreversible' | 'financial'`.
- **Modelo de errores** (RFC-000 §15): `ErrorCode`, `AutixErrorShape` (forma
  serializable, segura para cruzar la frontera de red hacia/desde un
  Connector out-of-process) y `AutixError` (clase de conveniencia para
  lanzar/atrapar dentro de un proceso, con `.toShape()` para serializar).
- **`CapabilityContract`**: el contrato de negocio agnóstico de Connector
  (RFC-001 §5) — incluye `compensable`/`compensatedBy` porque toda
  Capability debe declarar desde su definición si puede participar de un
  Workflow distribuido (RFC-001 §6.2).
- **`ToolContract`**: la implementación de una Capability para un Connector
  concreto (RFC-000 §8, RFC-001 §4) — `inputSchema`/`outputSchema` son el
  schema **nativo** de ese Connector, no el canonical schema de la
  Capability. Desde Sprint 13 también expone `compensable?`/
  `compensatedBy?` — el mismo concepto de `CapabilityContract`, pero
  **opcional** (a diferencia del requerido de Capability): se agregó para
  que el `WorkflowEngine` pueda compensar sobre un `toolId`/`connectorId`
  concretos sin romper los ~9 sitios existentes que construyen
  `ToolContract` sin necesitarlo. Desde Sprint 14 también expone
  `implementsCapabilityVersion?` (a qué versión exacta de la Capability se
  bindea; ausente = la última) e `inputJsonSchema?`/`outputJsonSchema?` —
  el schema real de negocio para una Tool registrada por wire, donde
  `inputSchema`/`outputSchema` (Zod) quedan en un placeholder
  (`z.unknown()`) que nunca se usa para validar.
- **`JsonSchemaDocument`** (`Record<string, unknown>`, Sprint 14): la forma
  de un schema de negocio tal como viaja por el wire — JSON Schema Draft
  2020-12 puro, el mismo que `toJsonSchema()` (`@autix/schemas`) ya emite.
- **`WorkflowContract`/`WorkflowStep`/`WorkflowStepCompensation`/
  `WorkflowRetryPolicy`** (RFC-001, Sprint 13): el contrato de un Workflow
  — una capacidad de negocio reutilizable que orquesta un **DAG** de
  `WorkflowStep`s, potencialmente sobre Tools de varios Connectors
  distintos en la misma ejecución. Campos mínimos según RFC-001: `id`
  (legible y estable, p. ej. `campolac.crear-pedido`, nunca un UUID
  opaco), `name`, `version`, `description`, `inputs`, `outputs`, `steps`,
  `timeout`, `retryPolicy`, `metadata`. Cada `WorkflowStep` soporta `id`,
  `toolId`, `connectorId`, `dependsOn`, `condition`, `parallelGroup`,
  `compensation`, `inputMapping`, `outputMapping` — desacoplado de
  cualquier Connector específico.
- **`WorkflowExecutionContext`/`WorkflowStepOutcome`**: lo que ven
  `condition`/`inputMapping`/`outputMapping` — funciones TypeScript
  planas (`{workflowInput, steps}`), deliberadamente sin ningún DSL de
  templating/expresiones nuevo, consistente con que `ToolContract.inputSchema`
  ya es un objeto Zod en proceso, no un artefacto serializado.
- **`ConnectorManifest`**: la forma del manifiesto que un Connector publica
  al registrarse **en proceso** (RFC-000 §13) — embebe `ToolContract`s con
  schemas Zod en memoria; solo la forma, su validación e indexación son
  del Registry (`@autix/core`, Sprint 3).
- **`ConnectorManifestDocument`/`CapabilityManifestEntry`/`ToolManifestEntry`**
  (Sprint 14, Capability Registry): la forma del manifiesto que un
  Connector publica **por wire** (`POST /v1/connectors/register`,
  `@autix/core-server`) — JSON puro, ningún tipo de TypeScript, para que
  un Connector en cualquier lenguaje (Python, Go, Rust, Java) pueda
  producirlo con solo un serializador JSON. `protocolVersion` versiona el
  formato del documento en sí, independiente de `connector.version` (la
  versión de ese Connector). Los Workflows **no** viajan acá — no
  pertenecen a un solo Connector (RFC-001 §4) y siguen registrándose
  directo contra el Registry.
- **`isValidSemver` / `compareSemver`**: parsing y comparación de SemVer
  2.0.0 (implementado a mano, no con el paquete `semver` de npm — ver el
  comentario en `semver.ts` — validado contra el ejemplo canónico de
  precedencia del spec). El Registry los usa para resolver "la última
  versión" de una Tool (RFC-000 §21).
- **`Principal`** (RFC-000 §10-§11): quién invoca — un agente autenticado,
  su `tenantId`, y un conjunto plano de `grantedScopes`. Desde Sprint 15
  también expone `roles?`/`permissions?`/`claims?` (todos opcionales) — un
  `Principal` resuelto desde un JWT real (`JwksTokenVerifier`,
  `@autix/core`) los popula; `ScopePolicyEngine` (Sprint 6) sigue leyendo
  solo `grantedScopes`, sin cambios — quedan disponibles para un
  `PolicyEngine` futuro más rico. Delegación (un agente actuando _en
  nombre de_ un usuario humano dentro de una conversación) sigue sin
  modelarse.
- **`PolicyDecision`** (RFC-000 §11): el resultado de autorizar, nunca un
  booleano — `'allow' | 'deny' | 'require_approval'`, este último para
  acciones de alto riesgo que necesitan confirmación humana explícita
  (el canal de esa confirmación todavía no existe, ver `@autix/core`).
- **`AuditEvent`** (RFC-000 §16): un registro de un intento de invocación
  — sin `input` todavía (RFC-000 pide que viaje redactado por PII; sin esa
  política, se omite en vez de guardarlo sin redactar), y con
  `toolVersion`/`connectorId`/`decision` opcionales porque no siempre
  llegan a existir (p. ej. si la Tool nunca se encontró).
- **`DomainEvent`** (RFC-000 §18): unión discriminada por `type` —
  `ToolInvoked` / `ToolSucceeded` / `ToolFailed` / `PolicyDenied` /
  `ApprovalRequested` / `ConnectorRegistered` / `WorkflowStarted` /
  `WorkflowSucceeded` / `WorkflowFailed` / `WorkflowStepCompensated`
  (los últimos 4, Sprint 13) — para efectos secundarios desacoplados de
  la respuesta al agente (ver `@autix/core` para
  `ApprovalGranted`/`ConnectorDegraded`, deliberadamente no incluidos
  todavía: sus precondiciones no existen). `ConnectorRegistered` gana un
  campo opcional en Sprint 14, `capabilityCount` — poblado solo cuando el
  registro fue por wire (`registerConnectorManifestDocument`), ausente en
  el registro en proceso (`registerConnector`).
- **`ErrorCode`**: incluye `TIMEOUT` desde Sprint 13 (un Workflow que
  excede su timeout — distinto de `CONNECTOR_UNAVAILABLE`, que es un
  Connector caído).

## Por qué no depende de `@autix/schemas`

`CapabilityContract`/`ToolContract` son genéricos sobre `z.ZodType` (el tipo
de la librería `zod`), no sobre ningún tipo definido en `@autix/schemas`.
Esto evita una dependencia circular: `@autix/schemas` sí depende de
`@autix/contracts` (para reusar `ErrorCode`/`AutixErrorShape` en sus
resultados de validación), así que si `@autix/contracts` dependiera de
`@autix/schemas` se cerraría un ciclo.

`zod` es `peerDependency` (no `dependency`) de este paquete: su tipo
(`z.ZodType`) forma parte de la superficie pública de `CapabilityContract`
y `ToolContract`, así que quien consuma este paquete debe compartir la
misma instancia/versión de `zod` — exactamente el mismo motivo por el que
librerías de componentes declaran `react` como peer, no como dependency.

## Scripts

```sh
pnpm --filter @autix/contracts build      # compila a dist/ (ESM + .d.ts)
pnpm --filter @autix/contracts typecheck  # tsc --noEmit
pnpm --filter @autix/contracts test       # vitest run
```
