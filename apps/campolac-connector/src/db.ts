import { Pool } from 'pg';

/**
 * Cadena de conexión por defecto: la misma base/usuario que documenta
 * `campolac-hermes-guide.md` para el Postgres real de Campolac OS
 * (`CREATE DATABASE campolac; CREATE USER campolac_user ...`). Sobreescribible
 * con `DATABASE_URL`.
 */
const DEFAULT_DATABASE_URL = 'postgres://campolac_user:Campolac2026@127.0.0.1:5432/campolac';

export function createPool(): Pool {
  return new Pool({ connectionString: process.env['DATABASE_URL'] ?? DEFAULT_DATABASE_URL });
}

interface ProductoRow {
  readonly nombre: string;
  readonly precio_mayor: string;
  readonly stock_kg: string;
  readonly unidad: string;
}

export interface Producto {
  readonly nombre: string;
  readonly precioMayor: number;
  readonly stockKg: number;
  readonly unidad: string;
}

interface ClienteRow {
  readonly id: number;
  readonly nombre: string;
  readonly telefono: string;
  readonly tipo: string;
  readonly limite_credito: string;
  readonly saldo_deuda: string;
}

export interface Cliente {
  readonly id: number;
  readonly nombre: string;
  readonly telefono: string;
  readonly tipo: string;
  readonly limiteCredito: number;
  readonly saldoDeuda: number;
}

export interface PedidoItem {
  readonly productoId: number;
  readonly productoNombre: string;
  readonly cantidad: number;
  readonly precioUnitario: number;
}

export interface PedidoCreado {
  readonly id: number;
  readonly clienteId: number;
  readonly estado: string;
  readonly total: number;
  readonly itemsCount: number;
}

/**
 * Réplica exacta de la query `consultar_precio_stock` documentada en
 * `campolac-hermes-guide.md` (Workflow 1, tool Postgres del agente Hermes)
 * — mismo filtro (`nombre ILIKE`), mismo orden, mismo límite. `pg` devuelve
 * `NUMERIC` como string por defecto (evita pérdida de precisión) — se
 * convierte acá, no antes.
 */
export async function consultarProductos(
  pool: Pool,
  producto: string,
): Promise<readonly Producto[]> {
  const result = await pool.query<ProductoRow>(
    `SELECT nombre, precio_mayor, stock_kg, unidad
     FROM productos
     WHERE activo = true
       AND nombre ILIKE '%' || $1 || '%'
     ORDER BY nombre
     LIMIT 10`,
    [producto],
  );

  return result.rows.map((row) => ({
    nombre: row.nombre,
    precioMayor: Number(row.precio_mayor),
    stockKg: Number(row.stock_kg),
    unidad: row.unidad,
  }));
}

/**
 * Busca clientes por nombre o teléfono. Devuelve hasta 10 resultados.
 */
export async function buscarCliente(
  pool: Pool,
  criterio: string,
): Promise<readonly Cliente[]> {
  const result = await pool.query<ClienteRow>(
    `SELECT id, nombre, telefono, tipo, limite_credito, saldo_deuda
     FROM clientes
     WHERE activo = true
       AND (nombre ILIKE '%' || $1 || '%' OR telefono LIKE '%' || $1 || '%')
     ORDER BY nombre
     LIMIT 10`,
    [criterio],
  );

  return result.rows.map((row) => ({
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono,
    tipo: row.tipo,
    limiteCredito: Number(row.limite_credito),
    saldoDeuda: Number(row.saldo_deuda),
  }));
}

/**
 * Crea un pedido con sus items. Retorna el pedido creado.
 */
export async function crearPedido(
  pool: Pool,
  clienteId: number,
  items: readonly PedidoItem[],
): Promise<PedidoCreado> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obtener datos del cliente
    const clienteResult = await client.query<{ nombre: string; telefono: string }>(
      'SELECT nombre, telefono FROM clientes WHERE id = $1',
      [clienteId],
    );

    if (clienteResult.rows.length === 0) {
      throw new Error(`Cliente ${clienteId} no encontrado`);
    }

    const cliente = clienteResult.rows[0];

    // 2. Calcular total
    let total = 0;
    for (const item of items) {
      total += item.cantidad * item.precioUnitario;
    }

    // 3. Crear pedido
    const pedidoResult = await client.query<{ id: number }>(
      `INSERT INTO pedidos (cliente_id, cliente_nombre, cliente_tel, estado, origen, total)
       VALUES ($1, $2, $3, 'pendiente', 'api', $4)
       RETURNING id`,
      [clienteId, cliente.nombre, cliente.telefono, total],
    );

    const pedidoId = pedidoResult.rows[0].id;

    // 4. Crear items del pedido
    for (const item of items) {
      const subtotal = item.cantidad * item.precioUnitario;
      await client.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, producto_nombre, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [pedidoId, item.productoId, item.productoNombre, item.cantidad, item.precioUnitario, subtotal],
      );
    }

    await client.query('COMMIT');

    return {
      id: pedidoId,
      clienteId,
      estado: 'pendiente',
      total,
      itemsCount: items.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
