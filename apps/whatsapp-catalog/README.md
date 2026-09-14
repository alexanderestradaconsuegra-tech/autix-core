# WhatsApp Catalog Builder

Micro-SaaS: convierte un listado de productos en un catálogo web mobile-first
con carrito de compras que arma el pedido y lo envía por WhatsApp al negocio.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + RLS) como backend de catálogo
- Zustand (persistido en `localStorage`) para el carrito

## Estructura

```
apps/whatsapp-catalog/
├── sql/
│   └── schema.sql              # Tablas, RLS e índices (Supabase)
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx            # Landing mínima
│   │   ├── admin/               # Panel de administración (placeholder — ver abajo)
│   │   └── c/[slug]/
│   │       ├── page.tsx         # Vista pública del catálogo (ISR, revalidate=60)
│   │       ├── not-found.tsx    # slug inexistente / negocio inactivo
│   │       └── error.tsx        # fallo de datos (Supabase caído, env faltante)
│   ├── components/
│   │   ├── catalog/
│   │   │   ├── CatalogHeader.tsx
│   │   │   ├── ProductGrid.tsx  # búsqueda + filtro de categoría + grilla
│   │   │   ├── ProductCard.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   ├── CategoryFilter.tsx
│   │   │   ├── CartSheet.tsx    # carrito flotante + hoja de resumen
│   │   │   └── OrderModal.tsx   # datos del cliente → genera el link de WhatsApp
│   │   └── admin/                # CSVImporter, formularios de producto (pendiente)
│   ├── lib/
│   │   ├── types.ts              # Business, Category, Product, CatalogData
│   │   ├── currency.ts           # formatCurrency por código ISO 4217
│   │   ├── whatsapp.ts           # validación de teléfono + builder del mensaje/URL
│   │   └── supabase/server.ts    # cliente anon + getCatalogBySlug()
│   └── store/
│       └── cart-store.ts         # Zustand + persist (localStorage)
└── .env.example
```

## Contrato de datos para el panel de administración

Lo que sí se entregó (vista pública + carrito) consume `sql/schema.sql`
directamente vía `getCatalogBySlug()`. El panel `/admin` queda como
placeholder: debe implementar CRUD de `businesses`/`categories`/`products`
autenticado con Supabase Auth (`owner_id = auth.uid()`, ya cubierto por las
políticas RLS del esquema) y un `CSVImporter` que parsee un CSV con columnas
`name,description,price,category,image_url,stock` y haga upsert masivo contra
`products`. Los tipos en `src/lib/types.ts` son el contrato que ese código
debe respetar.

## Variables de entorno

Ver `.env.example`. `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
son obligatorias para que `/c/[slug]` funcione — sin ellas, `error.tsx` se
muestra en vez de tirar un 500 sin contexto.

## Comandos

```bash
pnpm --filter @autix/whatsapp-catalog dev
pnpm --filter @autix/whatsapp-catalog build
pnpm --filter @autix/whatsapp-catalog typecheck
```
