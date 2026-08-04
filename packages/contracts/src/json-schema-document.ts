/**
 * Sprint 14 (Capability Registry): la forma de un schema de negocio tal
 * como viaja por el wire (`ConnectorManifestDocument`) — JSON Schema puro
 * (Draft 2020-12, el mismo que emite `toJsonSchema()` en `@autix/schemas`),
 * nunca un `z.ZodType`. Un Connector escrito en Python/Go/Rust/Java no
 * puede construir un objeto Zod, pero cualquier lenguaje puede serializar
 * JSON Schema — es la representación que hace que el protocolo sea
 * independiente del lenguaje (principio explícito de Sprint 14).
 *
 * Deliberadamente `Record<string, unknown>`, no un tipo que modele la
 * gramática completa de JSON Schema: ese modelado es responsabilidad de
 * quien lo compila/valida (`ajv`, en `@autix/schemas`), no de este paquete.
 */
export type JsonSchemaDocument = Record<string, unknown>;
