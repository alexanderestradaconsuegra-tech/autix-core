import type { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { consultarProductos, createPool } from './db.js';

/**
 * Contra el Postgres real de Campolac (`campolac-schema.sql` aplicado tal
 * cual, con su seed de 4 productos) — no un mock. Requiere un Postgres
 * local corriendo con ese schema (ver README: "Requisitos para desarrollo
 * local"). Réplica del comportamiento de `consultar_precio_stock` en
 * `campolac-hermes-guide.md`.
 */
describe('consultarProductos (contra Postgres real)', () => {
  const pool: Pool = createPool();

  afterAll(async () => {
    await pool.end();
  });

  it('encuentra los quesos del seed por coincidencia parcial en el nombre', async () => {
    const productos = await consultarProductos(pool, 'queso');

    const nombres = productos.map((p) => p.nombre);
    expect(nombres).toEqual(['Queso Fresco Campo', 'Queso Gouda Madurado', 'Queso Mantecoso']);
    // La mantequilla no tiene "queso" en el nombre — no debe aparecer.
    expect(nombres).not.toContain('Mantequilla Artesanal');
  });

  it('devuelve precio y stock reales, convertidos a number (pg devuelve NUMERIC como string)', async () => {
    const [producto] = await consultarProductos(pool, 'Queso Fresco Campo');

    expect(producto).toMatchObject({ nombre: 'Queso Fresco Campo', unidad: 'kg' });
    expect(typeof producto?.precioMayor).toBe('number');
    expect(typeof producto?.stockKg).toBe('number');
    expect(producto?.precioMayor).toBeGreaterThan(0);
  });

  it('devuelve una lista vacía cuando no hay coincidencias', async () => {
    const productos = await consultarProductos(pool, 'producto-que-no-existe-xyz');
    expect(productos).toEqual([]);
  });

  it('el filtro es case-insensitive (ILIKE)', async () => {
    const productos = await consultarProductos(pool, 'GOUDA');
    expect(productos.map((p) => p.nombre)).toEqual(['Queso Gouda Madurado']);
  });
});
