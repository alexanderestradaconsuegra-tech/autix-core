/**
 * @autix/sdk
 *
 * En sprints futuros este paquete contendrá el SDK cliente que un agente
 * (Hermes u otro) o un Connector usan para hablar con Autix Core —
 * descubrimiento, invocación, manejo de errores tipados (RFC-000 §14-§15).
 * Sprint 1 no introduce ninguno de esos módulos todavía.
 *
 * Re-exporta @autix/core solo para probar la cadena de dependencias
 * `@autix/sdk -> @autix/core -> {@autix/contracts, @autix/schemas}` de
 * punta a punta dentro del workspace.
 */

export { CORE_PACKAGE_NAME, CORE_PACKAGE_VERSION } from '@autix/core';

export const SDK_PACKAGE_NAME = '@autix/sdk';
export const SDK_PACKAGE_VERSION = '0.0.0';
