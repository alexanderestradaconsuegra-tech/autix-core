import type { ConnectorId } from '@autix/contracts';

import type { ConnectorPort } from './connector-port.js';

/**
 * ConnectorDirectory: resuelve el `ConnectorPort` *en vivo* (un cliente
 * listo para invocar) de un `connectorId` — el "Connector Manager" que
 * menciona RFC-000 §2, acotado por ahora a solo esta resolución.
 *
 * No confundir con `RegistryStore` (Sprint 3): el Registry guarda *datos*
 * (el `ConnectorManifest` que un Connector publicó); este directorio
 * guarda *instancias* (con qué objeto concreto — `HttpConnectorClient` u
 * otro — hablarle a ese Connector). Son dos preocupaciones separadas a
 * propósito: un Connector puede estar registrado en el Registry sin tener
 * todavía un `ConnectorPort` resoluble (por eso `resolve` puede no
 * encontrar nada, y el Execution Engine lo trata como
 * `CONNECTOR_UNAVAILABLE`, no como un bug).
 *
 * `register` (Sprint 14): hasta Sprint 12, solo se llamaba directamente
 * sobre `InMemoryConnectorDirectory` (código de arranque, tests) — nunca a
 * través de este Port. Se agrega acá porque `POST /v1/connectors/register`
 * (`@autix/core-server`) necesita resolver el `ConnectorPort` real de un
 * Connector recién registrado por wire sin conocer la implementación
 * concreta del directorio.
 */
export interface ConnectorDirectory {
  register(connectorId: ConnectorId, port: ConnectorPort): void;
  resolve(connectorId: ConnectorId): ConnectorPort | undefined;
}
