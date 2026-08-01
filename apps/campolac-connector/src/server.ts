import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import { consultarProductos, buscarCliente, crearPedido, type PedidoItem } from './db.js';

/**
 * Forma del wire del Connector Contract (RFC-000 §7, decisión de Sprint 4:
 * HTTP + JSON, sobre simple). Definida acá tal cual — a propósito, sin
 * importar `@autix/contracts` — para probar que el contrato es de
 * *protocolo*, no de código compartido: cualquier Connector real (en
 * cualquier lenguaje) puede implementarlo con solo conocer esta forma.
 */
interface ConnectorInvokeRequestBody {
  readonly toolId?: unknown;
  readonly version?: unknown;
  readonly input?: unknown;
  readonly context?: unknown;
}

type ConnectorInvokeResult =
  | { readonly success: true; readonly output: unknown }
  | {
      readonly success: false;
      readonly error: { readonly code: string; readonly message: string };
    };

const CONSULTAR_PRODUCTOS_TOOL_ID = 'campolac.productos.consultar';
const BUSCAR_CLIENTE_TOOL_ID = 'campolac.clientes.buscar';
const CREAR_PEDIDO_TOOL_ID = 'campolac.pedidos.crear';

function notFound(message: string): ConnectorInvokeResult {
  return { success: false, error: { code: 'NOT_FOUND', message } };
}

function validationError(message: string): ConnectorInvokeResult {
  return { success: false, error: { code: 'VALIDATION_ERROR', message } };
}

function unavailable(message: string): ConnectorInvokeResult {
  return { success: false, error: { code: 'CONNECTOR_UNAVAILABLE', message } };
}

function extractProducto(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const producto = (input as Record<string, unknown>)['producto'];
  return typeof producto === 'string' ? producto : undefined;
}

function extractCriterio(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const criterio = (input as Record<string, unknown>)['criterio'];
  return typeof criterio === 'string' ? criterio : undefined;
}

function extractPedidoData(input: unknown): { clienteId: number; items: PedidoItem[] } | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const obj = input as Record<string, unknown>;

  const clienteId = obj['clienteId'];
  const items = obj['items'];

  if (typeof clienteId !== 'number') return undefined;
  if (!Array.isArray(items)) return undefined;
  if (!items.every((item) =>
    typeof item === 'object' &&
    item !== null &&
    typeof (item as Record<string, unknown>)['productoId'] === 'number' &&
    typeof (item as Record<string, unknown>)['productoNombre'] === 'string' &&
    typeof (item as Record<string, unknown>)['cantidad'] === 'number' &&
    typeof (item as Record<string, unknown>)['precioUnitario'] === 'number'
  )) {
    return undefined;
  }

  return {
    clienteId,
    items: items as PedidoItem[],
  };
}

export interface BuildConnectorServerOptions {
  /** Default `false` — los tests no quieren el ruido de logs de Fastify. */
  readonly logger?: boolean;
}

/**
 * Servidor HTTP del Connector real de Campolac: `GET /healthz` (chequea la
 * conexión a Postgres) y `POST /invoke` (RFC-000 §7) — implementa 3 Tools:
 * - `campolac.productos.consultar`: consulta precio y stock por nombre
 * - `campolac.clientes.buscar`: busca clientes por nombre o teléfono
 * - `campolac.pedidos.crear`: crea un nuevo pedido con items
 */
export function buildConnectorServer(
  pool: Pool,
  options: BuildConnectorServerOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/healthz', async () => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ok' as const };
    } catch (error) {
      return {
        status: 'down' as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  app.post<{ Body: ConnectorInvokeRequestBody }>('/invoke', async (request, reply) => {
    const { toolId, input } = request.body;

    // Tool: Consultar Productos
    if (toolId === CONSULTAR_PRODUCTOS_TOOL_ID) {
      const producto = extractProducto(input);
      if (producto === undefined) {
        await reply.status(200).send(validationError('El input debe incluir "producto" (string).'));
        return;
      }

      try {
        const productos = await consultarProductos(pool, producto);
        await reply.status(200).send({ success: true, output: { productos } });
      } catch (error) {
        await reply
          .status(200)
          .send(
            unavailable(
              `No se pudo consultar Postgres: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
      }
      return;
    }

    // Tool: Buscar Cliente
    if (toolId === BUSCAR_CLIENTE_TOOL_ID) {
      const criterio = extractCriterio(input);
      if (criterio === undefined) {
        await reply.status(200).send(validationError('El input debe incluir "criterio" (string).'));
        return;
      }

      try {
        const clientes = await buscarCliente(pool, criterio);
        await reply.status(200).send({ success: true, output: { clientes } });
      } catch (error) {
        await reply
          .status(200)
          .send(
            unavailable(
              `No se pudo consultar Postgres: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
      }
      return;
    }

    // Tool: Crear Pedido
    if (toolId === CREAR_PEDIDO_TOOL_ID) {
      const pedidoData = extractPedidoData(input);
      if (pedidoData === undefined) {
        await reply
          .status(200)
          .send(
            validationError('El input debe incluir "clienteId" (number) e "items" (array of objects).'),
          );
        return;
      }

      try {
        const pedido = await crearPedido(pool, pedidoData.clienteId, pedidoData.items);
        await reply.status(200).send({ success: true, output: { pedido } });
      } catch (error) {
        await reply
          .status(200)
          .send(
            unavailable(
              `No se pudo crear el pedido: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
      }
      return;
    }

    // Tool no implementada
    await reply
      .status(200)
      .send(notFound(`Este Connector no implementa la Tool "${String(toolId)}".`));
  });

  return app;
}
