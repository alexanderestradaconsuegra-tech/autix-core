# Vitrina

Micro-SaaS: convierte un listado de productos en un catálogo web mobile-first
con carrito de compras que arma el pedido y lo envía por WhatsApp al negocio,
con cobro opcional por Mercado Pago y seguimiento de entrega.

Pensado para vivir bajo `autix.pro` (ej. `vitrina.autix.pro`).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + RLS + Storage) como backend
- Zustand (persistido en `localStorage`) para el carrito
- SDK oficial de Mercado Pago para el checkout

## Estructura

```
apps/vitrina/
├── sql/
│   └── schema.sql              # Tablas, RLS, Storage (Supabase)
├── src/
│   ├── app/
│   │   ├── page.tsx             # Landing: qué es, cómo funciona, cómo usar el panel
│   │   ├── admin/                # Panel: Negocio, Productos, Pedidos, Mensajes
│   │   ├── api/
│   │   │   ├── orders/           # POST: crea el pedido antes de abrir WhatsApp
│   │   │   └── checkout/mercadopago/  # POST: arma la preferencia de pago
│   │   └── c/[slug]/
│   │       ├── page.tsx          # Catálogo público (ISR, revalidate=60)
│   │       └── pedido/[token]/   # Seguimiento de entrega (link privado)
│   ├── components/
│   │   ├── catalog/              # CatalogHeader, ProductGrid, CartSheet, OrderModal, HelpModal...
│   │   └── admin/                # BusinessSettingsForm, ProductForm, OrdersTab, MessagesTab...
│   ├── lib/
│   │   ├── types.ts
│   │   ├── currency.ts
│   │   ├── whatsapp.ts           # Validación de teléfono + builder del mensaje/URL
│   │   ├── mercadopago.ts
│   │   └── supabase/
│   │       ├── server.ts         # anon key, lectura pública del catálogo
│   │       ├── client.ts         # anon key + sesión, para /admin
│   │       ├── public-client.ts  # anon key sin sesión, para acciones anónimas del catálogo
│   │       ├── service.ts        # service role key — SOLO server-side (route handlers/RSC)
│   │       ├── orders.ts         # createOrder() / getOrderByTrackingToken() — server-only
│   │       └── admin.ts          # CRUD del panel (negocio, productos, pedidos, mensajes)
│   └── store/
│       └── cart-store.ts         # Zustand + persist (localStorage)
└── .env.example
```

## Funcionalidad

- **Catálogo público** (`/c/[slug]`): búsqueda, filtro por categoría, carrito flotante.
- **Pedido por WhatsApp**: arma el mensaje con el formato de la orden y abre `wa.me` con todo prellenado.
- **Cobro con Mercado Pago** (opcional, por negocio): cada negocio conecta su propio access token desde
  `/admin` → pestaña Negocio. Se guarda en `business_payment_settings`, una tabla sin lectura pública —
  solo el dueño (RLS) o el route handler server-side (service role key) pueden leerlo.
- **Seguimiento de entrega**: cada pedido tiene un `tracking_token` (uuid) que arma un link privado
  `/c/[slug]/pedido/[token]`. El dueño avanza el estado desde `/admin` → pestaña Pedidos
  (Recibido → Preparando → En camino → Entregado) y el cliente lo ve sin necesitar cuenta.
- **Reseñas de Google**: el negocio configura su link de reseñas en `/admin`; se muestra al cliente
  justo después de confirmar un pedido.
- **Mensaje de ayuda**: botón "Ayuda" en el catálogo público — el cliente deja nombre + mensaje sin
  tener que agregar algo al carrito primero. Aparece en `/admin` → pestaña Mensajes.
- **Hero del catálogo**: foto de portada, título, subtítulo y horario de atención, configurables desde
  `/admin` → Negocio → Portada del catálogo. Se muestra entre el header y la grilla de productos.
- **Dirección + radio de entrega**: el dueño ingresa su dirección y `/api/geocode` la geocodifica con
  Google Maps Geocoding API (server-side, `GOOGLE_MAPS_API_KEY`) para guardar lat/lng. El radio en km
  se muestra en el catálogo como "Entrega hasta X km" — por ahora es informativo, no bloquea pedidos.
- **Licencia de por vida ($7 USD)**: cada negocio arranca en `license_status = 'trial'` (14 días,
  `src/lib/licensing.ts`). Al vencer, `/admin` bloquea todo detrás de `PaywallScreen` hasta que paguen.
  El botón "Activar mi licencia" llama a `/api/checkout/license`, que crea un checkout de Lemon Squeezy
  con `business_id` como custom data. Lemon Squeezy notifica el pago a
  `/api/webhooks/lemonsqueezy` (firma verificada con `LEMONSQUEEZY_WEBHOOK_SECRET`), que marca
  `license_status = 'active'`. Configura ese webhook en el dashboard de Lemon Squeezy apuntando a
  `https://tu-dominio/api/webhooks/lemonsqueezy`, evento `order_created`.

## Contrato de datos para funcionalidad futura

Los tipos en `src/lib/types.ts` (`Business`, `Product`, `Category`) y en
`src/lib/supabase/admin.ts` (`AdminOrder`, `AdminSupportMessage`) son el
contrato que cualquier código nuevo debe respetar.

## Variables de entorno

Ver `.env.example`. `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
son obligatorias para todo. `SUPABASE_SERVICE_ROLE_KEY` es obligatoria para
`/api/orders`, `/api/checkout/mercadopago` y la página de seguimiento — sin
ella, esos endpoints devuelven error 500 en vez de exponer datos sin RLS.

## Comandos

```bash
pnpm --filter @autix/vitrina dev
pnpm --filter @autix/vitrina build
pnpm --filter @autix/vitrina typecheck
```
