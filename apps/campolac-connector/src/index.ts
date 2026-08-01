/**
 * @autix/campolac-connector
 *
 * Sprint 12: el primer Connector **real**, fuera de proceso (RFC-000 §7,
 * §22), sobre el Postgres real de Campolac OS (`campolac-schema.sql`,
 * usado tal cual, sin modificar). Implementa el Connector Contract de
 * Sprint 4 (HTTP + JSON, `GET /healthz` + `POST /invoke`) con una única
 * Tool por ahora: `campolac.productos.consultar`, réplica exacta de la
 * tool `consultar_precio_stock` que ya usa el agente Hermes por n8n
 * (`campolac-hermes-guide.md`) — mismo filtro, mismo orden, mismo límite.
 *
 * Deliberadamente sin ninguna dependencia de `@autix/*`: el Connector
 * Contract es un contrato de protocolo, no de código compartido — este
 * Connector demuestra que cualquier proceso HTTP, en cualquier lenguaje,
 * puede implementarlo con solo conocer la forma del wire.
 */
import { createPool } from './db.js';
import { buildConnectorServer } from './server.js';

export { buildConnectorServer, type BuildConnectorServerOptions } from './server.js';
export {
  createPool,
  consultarProductos,
  buscarCliente,
  crearPedido,
  type Producto,
  type Cliente,
  type PedidoItem,
  type PedidoCreado,
} from './db.js';

export const CAMPOLAC_CONNECTOR_PACKAGE_NAME = '@autix/campolac-connector';
export const CAMPOLAC_CONNECTOR_PACKAGE_VERSION = '0.0.0';

const DEFAULT_PORT = 4200;
const DEFAULT_CORE_SERVER_URL = 'http://127.0.0.1:4000';

const PRODUCTO_JSON_SCHEMA = {
  type: 'object',
  properties: {
    nombre: { type: 'string' },
    precioMayor: { type: 'number' },
    stockKg: { type: 'number' },
    unidad: { type: 'string' },
  },
  required: ['nombre', 'precioMayor', 'stockKg', 'unidad'],
};

const CLIENTE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'number' },
    nombre: { type: 'string' },
    telefono: { type: 'string' },
    tipo: { type: 'string' },
    limiteCredito: { type: 'number' },
    saldoDeuda: { type: 'number' },
  },
  required: ['id', 'nombre', 'telefono'],
};

const PEDIDO_CREADO_JSON_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'number' },
    clienteId: { type: 'number' },
    estado: { type: 'string' },
    total: { type: 'number' },
    itemsCount: { type: 'number' },
  },
  required: ['id', 'clienteId', 'estado', 'total', 'itemsCount'],
};

/**
 * El `ConnectorManifestDocument` que este Connector publica al arrancar
 * (RC2 Fase 1, Studio Live Platform — `POST /v1/connectors/register`,
 * `@autix/core-server`). Escrito a mano como JSON puro, sin importar
 * `@autix/contracts` (misma razón que el resto de este Connector: el
 * contrato es de protocolo, no de código compartido) — la forma exacta
 * está documentada ahí, no acá.
 */
function buildManifestDocument(publicBaseUrl: string) {
  return {
    protocolVersion: '1.0',
    connector: {
      id: 'campolac-connector',
      version: CAMPOLAC_CONNECTOR_PACKAGE_VERSION,
      displayName: 'Campolac',
      endpoint: { baseUrl: publicBaseUrl },
    },
    capabilities: [
      {
        id: 'campolac.consultar_precio_stock',
        version: '1.0.0',
        description: 'Consulta precio y stock disponible de productos por nombre.',
        riskLevel: 'read',
        compensable: false,
        canonicalInputSchema: {
          type: 'object',
          properties: { producto: { type: 'string' } },
          required: ['producto'],
        },
        canonicalOutputSchema: {
          type: 'object',
          properties: { productos: { type: 'array', items: PRODUCTO_JSON_SCHEMA } },
          required: ['productos'],
        },
      },
      {
        id: 'campolac.buscar_cliente',
        version: '1.0.0',
        description: 'Busca clientes por nombre o teléfono.',
        riskLevel: 'read',
        compensable: false,
        canonicalInputSchema: {
          type: 'object',
          properties: { criterio: { type: 'string' } },
          required: ['criterio'],
        },
        canonicalOutputSchema: {
          type: 'object',
          properties: { clientes: { type: 'array', items: CLIENTE_JSON_SCHEMA } },
          required: ['clientes'],
        },
      },
      {
        id: 'campolac.crear_pedido',
        version: '1.0.0',
        description: 'Crea un nuevo pedido con items.',
        riskLevel: 'write',
        compensable: true,
        canonicalInputSchema: {
          type: 'object',
          properties: {
            clienteId: { type: 'number' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productoId: { type: 'number' },
                  productoNombre: { type: 'string' },
                  cantidad: { type: 'number' },
                  precioUnitario: { type: 'number' },
                },
                required: ['productoId', 'productoNombre', 'cantidad', 'precioUnitario'],
              },
            },
          },
          required: ['clienteId', 'items'],
        },
        canonicalOutputSchema: {
          type: 'object',
          properties: { pedido: PEDIDO_CREADO_JSON_SCHEMA },
          required: ['pedido'],
        },
      },
    ],
    tools: [
      {
        id: 'campolac.productos.consultar',
        connectorId: 'campolac-connector',
        version: '1.0.0',
        implementsCapability: 'campolac.consultar_precio_stock',
        description: 'Réplica de la tool consultar_precio_stock del agente Hermes.',
        riskLevel: 'read',
        requiredScopes: [],
        idempotent: true,
        inputSchema: {
          type: 'object',
          properties: { producto: { type: 'string' } },
          required: ['producto'],
        },
        outputSchema: {
          type: 'object',
          properties: { productos: { type: 'array', items: PRODUCTO_JSON_SCHEMA } },
          required: ['productos'],
        },
      },
      {
        id: 'campolac.clientes.buscar',
        connectorId: 'campolac-connector',
        version: '1.0.0',
        implementsCapability: 'campolac.buscar_cliente',
        description: 'Busca clientes activos por nombre o teléfono.',
        riskLevel: 'read',
        requiredScopes: [],
        idempotent: true,
        inputSchema: {
          type: 'object',
          properties: { criterio: { type: 'string' } },
          required: ['criterio'],
        },
        outputSchema: {
          type: 'object',
          properties: { clientes: { type: 'array', items: CLIENTE_JSON_SCHEMA } },
          required: ['clientes'],
        },
      },
      {
        id: 'campolac.pedidos.crear',
        connectorId: 'campolac-connector',
        version: '1.0.0',
        implementsCapability: 'campolac.crear_pedido',
        description: 'Crea un nuevo pedido en estado pendiente con sus items.',
        riskLevel: 'write',
        requiredScopes: [],
        idempotent: false,
        inputSchema: {
          type: 'object',
          properties: {
            clienteId: { type: 'number' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productoId: { type: 'number' },
                  productoNombre: { type: 'string' },
                  cantidad: { type: 'number' },
                  precioUnitario: { type: 'number' },
                },
                required: ['productoId', 'productoNombre', 'cantidad', 'precioUnitario'],
              },
            },
          },
          required: ['clienteId', 'items'],
        },
        outputSchema: {
          type: 'object',
          properties: { pedido: PEDIDO_CREADO_JSON_SCHEMA },
          required: ['pedido'],
        },
      },
    ],
  };
}

/**
 * Se registra contra el Core real al arrancar (RC2 Fase 1): sin este paso,
 * el Registry queda vacío y Studio no tiene ningún dato real que mostrar
 * (Sprint 14 ya expone `POST /v1/connectors/register`, pero ningún proceso
 * lo invocaba todavía). No es fatal si el Core no está arriba — este
 * Connector sigue sirviendo su propio `/healthz`/`/invoke` igual, para no
 * romper el uso standalone que ya existía.
 */
async function registerWithCoreServer(publicBaseUrl: string): Promise<void> {
  const coreServerUrl = process.env['CORE_SERVER_URL'] ?? DEFAULT_CORE_SERVER_URL;

  try {
    const response = await fetch(`${coreServerUrl}/v1/connectors/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildManifestDocument(publicBaseUrl)),
    });
    if (!response.ok) {
      console.warn(`No se pudo registrar en el Core (${coreServerUrl}): HTTP ${response.status}.`);
    }
  } catch (error) {
    console.warn(
      `No se pudo alcanzar el Core en ${coreServerUrl} para registrarse: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

async function main(): Promise<void> {
  const pool = createPool();
  const app = buildConnectorServer(pool, { logger: true });

  const port = process.env['PORT'] ? Number(process.env['PORT']) : DEFAULT_PORT;
  await app.listen({ port, host: '0.0.0.0' });

  const publicBaseUrl = process.env['CONNECTOR_PUBLIC_URL'] ?? `http://127.0.0.1:${port}`;
  await registerWithCoreServer(publicBaseUrl);
}

const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
