# @autix/core

Runtime de Autix Core: Discovery, AuthN/AuthZ, Execution Engine,
Capability/Tool/Workflow Registry, Policy Engine, Workflow Engine e
identidad real vía OAuth 2.1 (RFC-000 §6, §14; RFC-001 completa).

## Estado

✅ **Sprint 15.** Registry (Sprint 3) + ConnectorPort (Sprint 4) +
ExecutionEngine (Sprint 5) + PolicyEngine (Sprint 6) + AuditSink (Sprint 7) + EventBus (Sprint 8) + reintento/circuit breaker (Sprint 9) +
WorkflowEngine (Sprint 13) + Capability Registry (Sprint 14). Sprint 15
agrega el paso 2 de RFC-000 §14 que quedaba pendiente desde el inicio:
**`TokenVerifier`** (Port) + **`JwksTokenVerifier`** — Autix Core actúa
únicamente como Resource Server OAuth 2.1, verificando JWTs vía JWKS de
cualquier Authorization Server externo (Auth0, WorkOS, Keycloak, Azure
AD...), sin implementar un Authorization Server propio ni acoplarse al
SDK de MCP/Express — ver la sección "Identidad" más abajo.

Sprint 14 convierte al Registry en un **Capability Registry** de verdad:
antes de este sprint, `CapabilityContract` existía como tipo pero nunca se
indexaba — cada `ToolContract.implementsCapability` era una referencia
suelta que nadie validaba. Ahora el Registry tiene un tercer catálogo
(Capabilities, mismo patrón que Tools/Workflows), descubre
capability-céntrico (`discoverCapabilities()`), y sabe registrar un
Connector **por wire** (`registerConnectorManifestDocument`, JSON puro,
independiente del lenguaje del Connector) — la contraparte de
`apps/core-server`'s nuevo `POST /v1/connectors/register`.

## Registry

`Registry` es la capa de Application (casos de uso) sobre un
`RegistryStore` (Port, RFC-000 §3/§24) — hoy solo tiene una implementación
in-memory (`InMemoryRegistryStore`), reemplazable por un store persistente
sin tocar ninguna regla de negocio.

```ts
import { InMemoryEventBus, InMemoryRegistryStore, Registry } from '@autix/core';

const registry = new Registry(new InMemoryRegistryStore(), new InMemoryEventBus());

await registry.registerConnector(manifest); // valida invariantes, publica ConnectorRegistered
registry.discoverTools(); // última versión de cada Tool, ordenadas por id
registry.getTool(toolId); // última versión
registry.getTool(toolId, '1.2.0'); // versión exacta
registry.listToolVersions(toolId); // todas las versiones, más reciente primero
```

`registerConnector` es `async` desde Sprint 8 (lanza `AutixError` si viola
una regla, igual que antes — pero ahora rechaza la Promise, no lanza
sincrónicamente) porque, al final, publica `ConnectorRegistered` (RFC-000
§18) al `EventBus` — solo si el registro tuvo éxito, nunca en un registro
rechazado.

Reglas que aplica (todas trazables a RFC-000 §13/§21, ver el docblock de
`registry/registry.ts` para el detalle):

- Manifiesto y cada Tool deben tener una versión SemVer válida.
- Cada Tool debe declarar el `connectorId` del manifiesto que la publica.
- Una Tool no puede volver a registrarse con exactamente la misma versión
  (`CONFLICT`) — un fix se publica como versión nueva.
- El manifiesto del Connector es un snapshot (se reemplaza); sus Tools se
  acumulan por versión (RFC-000 §21: N versiones de una Tool en producción
  a la vez).
- Falla completa (nada se registra, ni se publica el evento) si cualquier
  Tool del manifiesto viola una regla — nunca un registro parcial.

**Simplificaciones deliberadas de Sprint 3** (no accidentales — documentadas
para no confundirlas con deuda técnica): `discoverTools()` no filtra por
permisos todavía (RFC-000 §12 lo exige antes de producción, pero requiere
el Policy Engine, que no existe); tampoco hay ciclo de vida
`pending → active` (RFC-000 §13) — el registro es inmediato.

Desde Sprint 13, el `Registry` también descubre **Workflows** — misma
`RegistryStore`, colección separada:

```ts
registry.registerWorkflow(workflow); // valida el DAG, sincrónico (sin evento — a diferencia de registerConnector)
registry.discoverWorkflows(); // última versión de cada Workflow, ordenadas por id
registry.getWorkflow(workflowId); // última versión
registry.getWorkflow(workflowId, '1.0.0'); // versión exacta
registry.listWorkflowVersions(workflowId); // todas las versiones
```

`registerWorkflow` valida, además de SemVer/duplicados/`CONFLICT` (mismas
reglas que Tools): ids de step únicos dentro del Workflow, que ningún
`dependsOn` apunte a un step inexistente, y que el DAG no tenga ciclos
(Kahn's algorithm, implementado desde cero — sin librería de grafos
nueva). **No valida que los `toolId` referenciados ya existan** en el
Registry al momento de registrar el Workflow — eso se difiere a tiempo de
ejecución (mismo `NOT_FOUND` que ya maneja `ExecutionEngine`), porque un
Workflow puede componerse legítimamente antes de que existan todos sus
Connectors.

## Capability Registry (Sprint 14)

Antes de este sprint, `CapabilityContract` (`@autix/contracts`) existía
como tipo pero el Registry nunca lo indexaba — un Connector era, en la
práctica, la unidad central del sistema. Sprint 14 lo invierte: **un
Connector es un proveedor de Capabilities**, no al revés.

```ts
registry.registerCapability(capability); // en proceso, sin Connector — útil para tests o para definir vocabulario de negocio de antemano
registry.discoverCapabilities(); // última versión de cada Capability + qué Tools (de qué Connectors) la implementan
registry.getCapability(capabilityId); // última versión
registry.listCapabilityVersions(capabilityId); // todas las versiones
```

`discoverCapabilities()` une cada Capability con sus `implementations`
(`{connectorId, toolId, toolVersion}`) buscando, entre las Tools
descubiertas, las que declaran `implementsCapability` igual a esa
Capability — una Tool sin `implementsCapabilityVersion` cuenta como
implementación de "la última versión" (mismo default que el resto del
Registry sin `version`); una Tool que la fija a una versión vieja no
aparece bajo la última.

### Registro por wire: `registerConnectorManifestDocument`

La contraparte de `registerConnector()` para un Connector que se registra
**por red**, en cualquier lenguaje:

```ts
await registry.registerConnectorManifestDocument(document); // document: unknown — JSON crudo del body HTTP
```

`document` es un `ConnectorManifestDocument` (`@autix/contracts`) — JSON
puro, sin clases ni tipos de TypeScript: un Connector en Python, Go, Rust
o Java puede producirlo con solo un serializador JSON. A diferencia de
`ConnectorManifest` (que embebe `ToolContract`s con Zod en memoria, para
registro in-process), acá todo schema de negocio
(`canonicalInputSchema`/`canonicalOutputSchema` de una Capability,
`inputSchema`/`outputSchema` de una Tool) es **JSON Schema** — el mismo
Draft 2020-12 que `toJsonSchema()` (`@autix/schemas`) ya emite desde
Sprint 2.

Validación, todo-o-nada, en orden:

1. La forma exacta del documento (Zod, `parseConnectorManifestDocument` —
   no es un tercer mecanismo de validación nuevo, es el mismo Zod que ya
   usa el resto del Core para formas TypeScript; la novedad es JSON
   Schema/ajv para los schemas de negocio que el documento transporta, no
   para el documento mismo).
2. `protocolVersion` debe ser una versión de formato que este Registry
   sepa interpretar.
3. Cada Capability declarada: SemVer válido, sin duplicados dentro del
   documento, y `id@version` no registrado ya por **ningún** Connector —
   una Capability es vocabulario de negocio compartido, no propiedad de un
   Connector. El segundo Connector que implementa una Capability ya
   registrada **no la vuelve a declarar**, solo la referencia desde
   `implementsCapability`/`implementsCapabilityVersion`.
4. Cada Tool declarada: `connectorId` coincide con el del manifiesto,
   SemVer válido, sin duplicados, y su referencia a una Capability debe
   resolver (declarada en este mismo documento o ya existente en el
   Registry) — si no, `VALIDATION_ERROR`.
5. Cada schema de negocio se **compila con ajv** (`compileJsonSchema`,
   `@autix/schemas`) en tiempo de **registro**, no de invocación — un
   Connector con un JSON Schema malformado se rechaza al registrarse.

`apps/core-server`'s `POST /v1/connectors/register` llama a este método y,
si tiene éxito, además resuelve el `ConnectorPort` real
(`HttpConnectorClient` apuntando a `connector.endpoint.baseUrl`) y lo
registra en el `ConnectorDirectory` — el `Registry` en sí no sabe nada de
transporte, esa responsabilidad queda en la capa HTTP. Probado
manualmente contra el `@autix/campolac-connector` real (Postgres real
detrás): registro por wire → `GET /v1/capabilities` → invocación real, sin
ningún registro programático de por medio (ver
`apps/core-server/README.md`).

## ConnectorPort

`ConnectorPort` (RFC-000 §3, §7, §24) es la vista del Core sobre un
Connector out-of-process: cómo lo invoca, no cómo el Connector se registra
(eso es `Registry.registerConnector()` en proceso, o
`registerConnectorManifestDocument()` por wire desde Sprint 14 — en
ambos casos, el Connector empuja su manifiesto, el Core no se lo pide).
`ConnectorDirectory` (Port) gana `register()` en Sprint 14 — antes solo se
llamaba sobre la implementación concreta (`InMemoryConnectorDirectory`);
ahora es parte del Port porque `POST /v1/connectors/register`
(`apps/core-server`) necesita resolver el `ConnectorPort` real de un
Connector recién registrado sin conocer la implementación concreta del
directorio.

```ts
import { HttpConnectorClient } from '@autix/core';

const campolac = new HttpConnectorClient({ baseUrl: 'http://localhost:4000' });

const health = await campolac.healthCheck(); // { status: 'ok' | 'degraded' | 'down', message? }

const result = await campolac.invoke({
  toolId: toToolId('campolac.productos.consultar'),
  input: { nombre: 'queso' },
  context: { tenantId, traceId },
});
// { success: true, output } | { success: false, error: AutixErrorShape }
```

**Transporte: HTTP + JSON con un sobre simple** (no gRPC, no JSON-RPC
2.0 — decisión consultada y confirmada con el usuario en Sprint 4). Reusa
tal cual el trabajo de Sprint 2: el mismo canonical schema (Zod → JSON
Schema) describe el contrato de negocio y el body del wire, sin un
segundo lenguaje de schema; el `AutixErrorShape` de Sprint 2 viaja tal
cual como error, sin traducción. `fetch`/`AbortSignal.timeout` ya vienen
en Node 22 — cero dependencias nuevas.

Un Connector expone dos endpoints: `GET /healthz` y `POST /invoke`. HTTP
2xx + `{ success: true, output }` o `{ success: false, error }` es una
respuesta de _aplicación_ válida — el Connector procesó la invocación, sea
éxito o error de negocio. Todo lo demás (timeout, conexión rechazada, HTTP
no-2xx, JSON inválido o con forma inesperada) es un fallo de _transporte_,
sintetizado por `HttpConnectorClient` como `CONNECTOR_UNAVAILABLE` (no se
pudo completar el intercambio) o `CONNECTOR_ERROR` (se completó, pero la
respuesta no es utilizable) — nunca algo que el propio Connector reportó.
`invoke()`/`healthCheck()` nunca lanzan para estos casos esperables:
siempre resuelven a un resultado, igual que `ValidationResult` en
`@autix/schemas`.

Simplificación de Sprint 4 todavía vigente: un único `timeoutMs` por
cliente, no un timeout por Tool (RFC-000 §14) — sí llegó el circuit
breaker (Sprint 9, ver abajo).

### CircuitBreakerConnectorPort

Decorator de `ConnectorPort` — envuelve cualquier implementación sin que
el resto del sistema note la diferencia:

```ts
import { CircuitBreakerConnectorPort, HttpConnectorClient } from '@autix/core';

directory.register(
  toConnectorId('campolac'),
  new CircuitBreakerConnectorPort(
    new HttpConnectorClient({ baseUrl: 'http://localhost:4000' }),
    { failureThreshold: 5, resetTimeoutMs: 30_000 }, // ambos opcionales, estos son los defaults
  ),
);
```

Solo cuenta `CONNECTOR_UNAVAILABLE` (fallo de transporte) para abrir el
circuito — un `NOT_FOUND` u otro error de negocio no lo abre, porque el
circuit breaker vigila si el Connector está _ahí_, no si una invocación
puntual tuvo éxito. Al abrirse, corta las invocaciones sin llamar al
Connector hasta que pase `resetTimeoutMs`; entonces deja pasar una
invocación de prueba (half-open) — si tiene éxito cierra el circuito, si
falla lo vuelve a abrir de inmediato. v0 no controla concurrencia durante
el half-open (dejaría pasar más de una invocación de prueba en paralelo)
— suficiente para el volumen actual, no algo que se necesite todavía.
Es opt-in: nadie lo aplica automáticamente, lo elige quien registra el
Connector en el `ConnectorDirectory`.

## PolicyEngine

`PolicyEngine.authorize(principal, tool)` (RFC-000 §9, §11) decide si una
invocación procede — nunca un booleano, tres estados:

```ts
import { ScopePolicyEngine } from '@autix/core';

const policy = new ScopePolicyEngine();

policy.authorize(principal, tool);
// { decision: 'allow' }
// { decision: 'deny', reason: '...' }              — falta algún requiredScope
// { decision: 'require_approval', reason: '...' }  — riskLevel: 'financial'
```

`ScopePolicyEngine` es el motor propio simple que RFC-000 §11 ya decidió
usar primero (no una elección de este sprint): `deny` si al `Principal` le
falta algún `requiredScopes` de la Tool; si tiene todos pero la Tool es
`riskLevel: 'financial'`, `require_approval`; si no, `allow`. Es un default
razonable, no una regla de negocio final — por eso vive detrás del Port
`PolicyEngine`, reemplazable sin tocar el `ExecutionEngine`.

**El canal de aprobación no existe todavía.** `require_approval` hoy
solo produce `APPROVAL_REQUIRED` como resultado — no hay cola de
invocaciones pendientes ni forma de reanudarlas tras una confirmación
humana. RFC-000 marca esto explícitamente como pregunta abierta
("Riesgos abiertos"), no como algo que este sprint debía resolver.

## Identidad: `TokenVerifier` (Sprint 15, RFC-000 §14 paso 2)

Hasta este sprint, el paso 2 de RFC-000 §14 ("resolución de identidad")
era el único que quedaba sin resolver del pipeline completo: se asumía
que `request.principal` ya llegaba autenticado por una capa anterior.
Sprint 15 cierra ese paso con una arquitectura confirmada con el usuario:

- **Autix Core actúa únicamente como Resource Server OAuth 2.1** — nunca
  implementa un Authorization Server propio (`/authorize`, `/token`,
  `/register`). Delega la autenticación a cualquier proveedor OAuth
  2.1/OIDC externo (Auth0, WorkOS, Keycloak, Azure AD...).
- **JWT firmado, validado vía JWKS** — sin introspección remota como
  mecanismo principal.
- **Abstracción propia** (`TokenVerifier`), deliberadamente sin acoplarse
  al middleware OAuth del SDK oficial de MCP (`server/auth/*`, construido
  sobre Express) ni a Express en sí.

```ts
import { JwksTokenVerifier } from '@autix/core';

const tokenVerifier = new JwksTokenVerifier({
  issuer: 'https://tu-idp.example.com/',
  audience: 'autix-agent-gateway',
  jwksUri: 'https://tu-idp.example.com/.well-known/jwks.json',
  // opcional — nombres de claim distintos según el IdP:
  claimMapping: { tenantId: 'org_id', permissions: 'perms' },
});

const principal = await tokenVerifier.verify(bearerToken);
// { principalId, tenantId, grantedScopes, roles?, permissions?, claims }
// o rechaza con AutixError('UNAUTHORIZED', ...)
```

`TokenVerifier` (Port, `identity/token-verifier.ts`) es
`verify(token: string): Promise<Principal>` — vive en `@autix/core`, no en
`apps/agent-gateway`, porque es infraestructura de identidad genérica:
cualquier frontera HTTP del Core (el Agent Gateway hoy, `@autix/core-server`
a futuro) puede depender del mismo Port sin duplicar lógica de
verificación. Quién parsea el header HTTP (`Authorization: Bearer ...`) y
extrae el token es responsabilidad de la frontera concreta (ver
`OAuthPrincipalResolver` en `apps/agent-gateway`), no de este Port.

`JwksTokenVerifier` es la **única implementación concreta que hace
falta**: al ser JWT + JWKS estándar de OIDC, sirve igual para cualquier
IdP compatible — cambiar de proveedor es cuestión de
`issuer`/`audience`/`jwksUri`/`claimMapping` (constructor), nunca una
clase nueva. Usa `createRemoteJWKSet` de [`jose`](https://github.com/panva/jose),
que cachea las claves públicas en memoria y las refresca automáticamente
cuando aparece un `kid` desconocido (con `cooldownDuration` para no
martillar el endpoint JWKS ante un token malicioso con un `kid`
inventado).

**Mapeo de claims → `Principal`** (todos configurables, con defaults
razonables): `sub` → `principalId`, `tenant_id` → `tenantId`, `scope` →
`grantedScopes` (acepta tanto un string separado por espacios, RFC 6749
§3.3, como un array — distintos IdPs emiten uno u otro), `roles` →
`roles`, `permissions` → `permissions`. Los claims crudos completos
también viajan en `Principal.claims`, para que un `PolicyEngine` futuro
pueda leer cualquier claim que un IdP concreto agregue sin que este
paquete tenga que anticiparlo.

**No implementado, a propósito**: introspección de tokens (JWT+JWKS cubre
los IdPs reales que importan hoy; el Port permite agregar una
implementación alternativa después sin tocar consumidores);
descubrimiento OIDC automático (`/.well-known/openid-configuration`) — el
operador configura `issuer`/`audience`/`jwksUri` directamente, más simple
y explícito para v0.

## ExecutionEngine

`ExecutionEngine.invokeTool()` es el pipeline real de RFC-000 §14, sobre lo
que ya existía: `Registry.getTool`, `validateAgainstSchema`
(`@autix/schemas`), `PolicyEngine.authorize`, `ConnectorDirectory.resolve`,
`ConnectorPort.invoke`, `AuditSink.record` y `EventBus.publish`.

```ts
import {
  ExecutionEngine,
  InMemoryAuditSink,
  InMemoryConnectorDirectory,
  InMemoryEventBus,
  InMemoryRegistryStore,
  Registry,
  ScopePolicyEngine,
} from '@autix/core';

const registry = new Registry(new InMemoryRegistryStore(), new InMemoryEventBus());
const directory = new InMemoryConnectorDirectory();
const engine = new ExecutionEngine({
  registry,
  connectors: directory,
  policyEngine: new ScopePolicyEngine(),
  auditSink: new InMemoryAuditSink(),
  eventBus: new InMemoryEventBus(),
});

await registry.registerConnector(campolacManifest);
directory.register(
  toConnectorId('campolac'),
  new HttpConnectorClient({ baseUrl: 'http://localhost:4000' }),
);

const result = await engine.invokeTool({
  toolId: toToolId('campolac.productos.consultar'),
  input: { nombre: 'queso' },
  principal, // { principalId, tenantId, grantedScopes }
  traceId,
});
// { success: true, output } | { success: false, error: AutixErrorShape }
```

El constructor toma un **objeto de dependencias**, no argumentos
posicionales — desde Sprint 8, cinco Ports (`registry`, `connectors`,
`policyEngine`, `auditSink`, `eventBus`) ya es demasiado para posicionales
sin arriesgar un error de orden al construirlo.

Pasos de RFC-000 §14 que implementa, en este orden (el orden lo especifica
el RFC): **3** (resolver Tool + versión — sin `version`, la última por
SemVer), **4** (validar `input` contra el schema _nativo_ de la Tool — si
falla, ni el PolicyEngine ni el Connector se llaman), **5** (autorizar —
`deny` → `FORBIDDEN` + evento `PolicyDenied`), **6** (`require_approval` →
`APPROVAL_REQUIRED` + evento `ApprovalRequested`), **7** (enrutar al
`ConnectorPort` correcto vía `ConnectorDirectory`), **8** (ejecutar, con
**reintento** — Sprint 9), **9** (normalización — valida también el
_output_ contra lo que la Tool declaró; si el Connector devuelve algo que
no cumple su propio contrato, es `CONNECTOR_ERROR`, nunca se pasa como si
fuera válido), **10** (auditoría — `AuditEvent` siempre — y eventos de
dominio — `ToolSucceeded`/`ToolFailed` según corresponda).

### Reintento de Tools idempotentes (Sprint 9)

Si la Tool declara `idempotent: true` y el Connector responde
`CONNECTOR_UNAVAILABLE` (fallo de _transporte_ — nunca un error de
negocio, que no se reintenta jamás), el `ExecutionEngine` reintenta hasta
`retry.maxAttempts` veces (default 3) con espera lineal
(`retry.delayMs * intento`, default 50ms):

```ts
const engine = new ExecutionEngine({
  registry,
  connectors: directory,
  policyEngine,
  auditSink,
  eventBus,
  retry: { maxAttempts: 3, delayMs: 50 }, // opcional, estos son los defaults
});
```

Cada intento — el primero y todos los reintentos — usa el **mismo**
`idempotencyKey`: si el caller no mandó uno, se usa el propio
`invocationId` de la invocación. Sin esto, reintentar sería inseguro (el
Connector no tendría forma de detectar que es un reintento y no una
invocación nueva, arriesgando side effects duplicados).

**2** (resolución de identidad) sigue sin implementarse _dentro_ del
`ExecutionEngine` mismo — sigue asumiendo que `request.principal` ya llegó
autenticado por una capa anterior. Desde Sprint 15 esa capa anterior es
real (`TokenVerifier`/`JwksTokenVerifier`, ver la sección "Identidad" más
arriba), resuelta en `apps/agent-gateway` antes de invocar — el
`ExecutionEngine` en sí no cambia, sigue sin saber nada de OAuth/JWT, tal
como RFC-000 §14 separa la resolución de identidad (paso 2) de la
ejecución en sí.

### Validación de Tools registradas por wire (Sprint 14)

El paso 4/9 (validar input/output) dispatchea entre dos caminos según
cómo se registró la Tool:

```ts
function validateToolInput(tool: ToolContract, input: unknown) {
  return tool.inputJsonSchema
    ? validateAgainstJsonSchema(tool.inputJsonSchema, input) // ajv — Tool registrada por wire
    : validateAgainstSchema(tool.inputSchema, input); // Zod — Tool registrada en proceso, sin cambios
}
```

Una Tool registrada vía `registerConnectorManifestDocument` trae
`inputJsonSchema`/`outputJsonSchema` poblados y `inputSchema`/`outputSchema`
(Zod) en un placeholder (`z.unknown()`, nunca usado para validar) — ver
`wire-conversion.ts`. Ninguna Tool registrada en proceso (los ~110+ tests
de sprints anteriores, `apps/examples`, `@autix/campolac-connector`)
cambia de comportamiento: sin `inputJsonSchema`/`outputJsonSchema`, sigue
validando con Zod exactamente como siempre.

## AuditSink

`AuditSink.record(event)` (RFC-000 §16) registra un `AuditEvent` por
_toda_ invocación — el `ExecutionEngine` lo hace desde un único punto de
salida para los fallos (`recordFailureAndReturn`) y desde el único retorno
de éxito, precisamente para que ningún camino de salida nuevo pueda
saltearse la auditoría por accidente.

```ts
import { InMemoryAuditSink } from '@autix/core';

const auditSink = new InMemoryAuditSink();
// ... pasado al ExecutionEngine ...
auditSink.list();
// [{ invocationId, timestamp, tenantId, principalId, toolId,
//    toolVersion?, connectorId?, decision?, outcome, errorCode?, durationMs }, ...]
```

`toolVersion`/`connectorId`/`decision` son opcionales a propósito: si la
Tool nunca se resolvió (`NOT_FOUND`), esos datos nunca existieron — un
campo obligatorio ahí forzaría a inventar un valor falso. **Sin `input`**:
RFC-000 pide que viaje redactado según una política de PII por campo;
sin esa política todavía, omitirlo es más seguro que guardarlo sin
redactar — se agrega cuando exista la política, no antes.

`InMemoryAuditSink` es la única implementación (v0): se pierde al
reiniciar, sin retención configurable ni inmutabilidad forzada por
storage — ambas exigidas por RFC-000 §16 para un backend real, ninguna
aplica a un array en memoria.

## EventBus

`EventBus.publish(event)` (RFC-000 §18) distribuye eventos de dominio para
efectos secundarios desacoplados de la respuesta al agente (notificar por
Telegram, actualizar un dashboard, alimentar analítica) — la invocación de
la Tool en sí sigue siendo request/response, nunca eventual.

```ts
import { InMemoryEventBus } from '@autix/core';

const eventBus = new InMemoryEventBus();
const unsubscribe = eventBus.subscribe((event) => {
  if (event.type === 'ToolFailed') {
    // notificar, actualizar un dashboard, etc. — desacoplado del
    // ExecutionEngine, que no sabe que este subscriber existe
  }
});
```

Eventos que el `ExecutionEngine` publica en cada invocación: `ToolInvoked`
al principio, y exactamente uno de `ToolSucceeded` / `ToolFailed` /
`PolicyDenied` / `ApprovalRequested` al final, según cómo haya terminado.
El `Registry` publica `ConnectorRegistered` tras un registro exitoso (no
en uno rechazado).

**No implementados, a propósito** (RFC-000 lista 8 tipos de evento, este
v0 cubre 6): `ApprovalGranted` — no existe todavía un canal de aprobación
que pueda _conceder_ nada; `ConnectorDegraded` — requeriría un loop de
monitoreo periódico llamando `healthCheck()`, que no existe (hoy solo se
llama bajo demanda). Ninguno de los dos se inventa a medias.

`InMemoryEventBus` es la única implementación (v0): `publish()` espera a
cada suscriptor en orden (síncrono en la práctica). RFC-000 recomienda un
outbox sobre Postgres/Supabase para volumen real, que desacoplaría esto de
la respuesta al agente — no se implementa esa asincronía real todavía
porque no hay backend persistente detrás de este v0.

## WorkflowEngine (Sprint 13, RFC-001)

`WorkflowEngine.executeWorkflow()` orquesta un **DAG** de `WorkflowStep`s
— una capacidad de negocio reutilizable (RFC-001: "no es un flujo visual
estilo n8n") que el Agente invoca como una sola llamada de alto nivel, sin
ver sus pasos internos. Diseñado para cualquier empresa (restaurantes,
retail, clínicas, logística), no solo Campolac — es el estándar de
orquestación de toda la plataforma Autix.

```ts
import { WorkflowEngine } from '@autix/core';

const workflowEngine = new WorkflowEngine({ registry, executionEngine, eventBus });

const result = await workflowEngine.executeWorkflow({
  workflowId: toWorkflowId('campolac.crear-pedido'),
  input: { clienteId, items },
  principal,
  traceId,
});
// { success: true, output, steps } | { success: false, error, steps, compensatedSteps }
```

**Composición (RFC-001 §1)**: el DAG se ejecuta por "oleadas" concurrentes
derivadas puramente de `dependsOn` — cada step cuyas dependencias ya
fueron _procesadas_ (sin importar el resultado) corre en la misma oleada
vía `Promise.all`. `parallelGroup` es metadata **descriptiva**, no un eje
de scheduling separado — evita dos fuentes de verdad sobre concurrencia
que podrían contradecirse.

**Ramas condicionales, sin cascada de skip**: un step cuyo `condition`
evalúa falso se marca `skipped` — sus dependientes igual quedan "listos"
en cuanto se procesa (da igual si fue `skipped` o no). Si se quiere que un
skip se propague, el propio `condition` del step dependiente puede
inspeccionar `context.steps[depId]?.status` — la composabilidad queda en
manos de quien escribe el Workflow, no de una decisión implícita del
motor.

**Transaccionalidad — saga (RFC-001 §2)**: sin rollback de base de datos.
Ante cualquier falla (incluida una falla de validación del output
agregado final), se compensan en **orden inverso de ejecución** todos los
steps ya exitosos que declararon `compensation` — una estructura
`{toolId, connectorId?, inputMapping}`, no solo un booleano, porque
compensar casi siempre necesita datos del propio output del step (p. ej.
un id de orden para cancelarla). Un step exitoso sin `compensation`
declarado nunca se compensa.

**Multi-Connector (RFC-001 §4)**: un mismo Workflow ejecuta Tools de
Connectors distintos en la misma ejecución de forma nativa — cada step
resuelve su propia Tool vía `Registry.getTool()`; si el step declara
`connectorId` y no coincide con el de la Tool resuelta, falla con
`VALIDATION_ERROR` antes de invocar nada.

**Reintento a nivel Workflow**: mismas guardas que el reintento de
`ExecutionEngine` (Sprint 9) — solo si `tool.idempotent` y el fallo es
`CONNECTOR_UNAVAILABLE` — aplicadas una capa más arriba, reintentando la
invocación completa del step (`ExecutionEngine.invokeTool()` de nuevo) con
el mismo `idempotencyKey` (`${executionId}:${stepId}`) en todos los
intentos. Ambas capas de reintento pueden convivir en producción sin
conflicto porque comparten la misma clave y la misma guarda de
seguridad.

**Timeout**: best-effort — se revisa antes de programar cada oleada
nueva, no hay cancelación real de llamadas en vuelo (no existe todavía
`AbortSignal` en `ConnectorPort`). Documentado como límite conocido, no
silencioso.

**Output agregado**: convención v0 (no un campo nuevo del contrato) — el
output final es `{ [stepId]: output }` para cada step **terminal**
(ningún otro step lo `dependsOn`) que haya tenido éxito, validado contra
`workflow.outputs`.

**No implementado, a propósito**: `AuditEvent` dedicado a nivel Workflow
(cada step ya audita individualmente al pasar por
`ExecutionEngine.invokeTool()`); cancelación real de steps en vuelo al
vencer el timeout (requeriría plumbing de `AbortSignal` en
`ConnectorPort`).

## Dependencias del workspace

- `@autix/contracts` (`workspace:*`)
- `@autix/schemas` (`workspace:*`) — desde Sprint 5: `ExecutionEngine` es
  el primer módulo de este paquete que valida schemas de negocio de
  verdad, no solo maneja sus tipos (por eso no era una dependencia hasta
  ahora, como se documentó en Sprint 2/3).
- `jose` (`^6.2.4`, Sprint 15) — `createRemoteJWKSet`/`jwtVerify` para
  `JwksTokenVerifier`. Es un detalle de implementación interno (ningún
  tipo público de este paquete expone un tipo de `jose`), por eso es
  `dependency`, no `peerDependency` — mismo criterio que `ajv` en
  `@autix/schemas`.

`zod` es `peerDependency`: `ToolContract`/`ConnectorManifest` (de
`@autix/contracts`) exponen `z.ZodType` en su forma, así que cualquier tipo
que el Registry maneje lo toca transitivamente.

## Scripts

```sh
pnpm --filter @autix/core build      # compila a dist/ (ESM + .d.ts)
pnpm --filter @autix/core typecheck  # tsc --noEmit
pnpm --filter @autix/core test       # vitest run
```
