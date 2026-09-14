-- Vitrina — esquema PostgreSQL/Supabase
-- Ejecutar en el SQL editor de Supabase o vía `supabase db push`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- businesses: un catálogo por negocio, identificado por slug único.
-- ---------------------------------------------------------------------------
create table if not exists businesses (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  slug              text not null unique,
  name              text not null,
  phone             text not null,               -- E.164 sin '+', ej: 56912345678
  currency          text not null default 'USD',  -- ISO 4217: USD, CLP, MXN, COP...
  logo_url          text,
  welcome_message   text,
  license_status    text not null default 'trial' check (license_status in ('trial', 'active', 'expired')),
  is_active         boolean not null default true,
  -- Espejo público (sin secretos) de business_payment_settings.mercadopago_enabled,
  -- para que la vista pública sepa si debe mostrar "Pagar con Mercado Pago"
  -- sin poder leer el access token.
  accepts_mercadopago boolean not null default false,
  -- Link de reseñas de Google del negocio (ej: g.page/r/.../review), se
  -- muestra en el catálogo público y tras confirmar un pedido.
  google_reviews_url text,
  -- Hero del catálogo público: foto de portada + título/subtítulo propios
  -- (distintos del logo circular y el nombre del header).
  hero_image_url    text,
  hero_title        text,
  hero_subtitle     text,
  -- Horario de atención, mostrado en el hero. Lista simple día/horario, ej:
  -- [{"day": "Lunes a viernes", "time": "9:00 am - 7:00 pm"}].
  business_hours    jsonb not null default '[]'::jsonb,
  -- Dirección física + coordenadas (geocodificadas server-side con Google
  -- Maps Geocoding API, ver src/app/api/geocode/route.ts) y radio de
  -- entrega en km, informativo por ahora — no valida contra la dirección
  -- del cliente todavía.
  address           text,
  address_lat       double precision,
  address_lng       double precision,
  delivery_radius_km numeric(6, 2) check (delivery_radius_km is null or delivery_radius_km > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint phone_format check (phone ~ '^[0-9]{8,15}$')
);

create index if not exists businesses_owner_id_idx on businesses (owner_id);

-- ---------------------------------------------------------------------------
-- categories: agrupación opcional de productos dentro de un negocio.
-- ---------------------------------------------------------------------------
create table if not exists categories (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id) on delete cascade,
  name          text not null,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists categories_business_id_idx on categories (business_id);

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id) on delete cascade,
  category_id   uuid references categories (id) on delete set null,
  name          text not null,
  description   text,
  price         numeric(12, 2) not null check (price >= 0),
  image_url     text,
  stock         integer check (stock is null or stock >= 0),
  is_available  boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists products_business_id_idx on products (business_id);
create index if not exists products_category_id_idx on products (category_id);
create index if not exists products_business_available_idx
  on products (business_id) where is_available = true;

-- ---------------------------------------------------------------------------
-- orders: registro de pedidos (WhatsApp o Mercado Pago), con estado de
-- entrega para que el negocio marque el avance y el cliente lo siga.
--
-- `tracking_token` es la única credencial del cliente para ver su pedido:
-- no hay política de lectura pública sobre esta tabla (ver más abajo), así
-- que la página de seguimiento /c/[slug]/pedido/[token] la resuelve
-- server-side con la service role key, nunca con la anon key. El token no
-- es adivinable (uuid v4), así que funciona como un link privado.
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses (id) on delete cascade,
  customer_name     text not null,
  customer_address  text,
  items             jsonb not null,   -- [{ productId, name, price, quantity }]
  total             numeric(12, 2) not null check (total >= 0),
  status            text not null default 'sent' check (status in ('sent', 'confirmed', 'cancelled', 'paid')),
  payment_method    text not null default 'whatsapp' check (payment_method in ('whatsapp', 'mercadopago')),
  delivery_status   text not null default 'received'
    check (delivery_status in ('received', 'preparing', 'out_for_delivery', 'delivered')),
  tracking_token    uuid not null default gen_random_uuid() unique,
  created_at        timestamptz not null default now()
);

create index if not exists orders_business_id_idx on orders (business_id, created_at desc);
create index if not exists orders_tracking_token_idx on orders (tracking_token);

-- ---------------------------------------------------------------------------
-- support_messages: "déjanos un mensaje" del catálogo público — no pasa por
-- WhatsApp necesariamente, el dueño lo ve en /admin.
-- ---------------------------------------------------------------------------
create table if not exists support_messages (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses (id) on delete cascade,
  customer_name   text not null,
  message         text not null,
  resolved        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists support_messages_business_id_idx on support_messages (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- business_payment_settings: credenciales de pago del negocio.
--
-- Vive en una tabla aparte (no en `businesses`) a propósito: `businesses`
-- tiene una política de lectura pública para la vista /c/[slug], y esta
-- tabla NO tiene ninguna política de SELECT pública — solo el dueño
-- (RLS) o un route handler server-side con la service role key pueden
-- leer el access token. Ver src/app/api/checkout/mercadopago/route.ts.
--
-- Producción: considera cifrar `mercadopago_access_token` con Supabase
-- Vault (pgsodium) en vez de guardarlo en texto plano.
-- ---------------------------------------------------------------------------
create table if not exists business_payment_settings (
  business_id               uuid primary key references businesses (id) on delete cascade,
  mercadopago_access_token  text,
  mercadopago_enabled       boolean not null default false,
  updated_at                timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists businesses_set_updated_at on businesses;
create trigger businesses_set_updated_at
  before update on businesses
  for each row execute function set_updated_at();

drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table businesses               enable row level security;
alter table categories               enable row level security;
alter table products                 enable row level security;
alter table orders                   enable row level security;
alter table business_payment_settings enable row level security;
alter table support_messages         enable row level security;

-- Lectura pública: solo negocios/categorías/productos activos y disponibles
-- (usada por la vista pública /c/[slug] con la anon key).
create policy "public_read_active_businesses"
  on businesses for select
  using (is_active = true);

create policy "public_read_categories_of_active_business"
  on categories for select
  using (
    exists (
      select 1 from businesses b
      where b.id = categories.business_id and b.is_active = true
    )
  );

create policy "public_read_available_products"
  on products for select
  using (
    is_available = true
    and exists (
      select 1 from businesses b
      where b.id = products.business_id and b.is_active = true
    )
  );

-- Escritura pública: solo INSERT de pedidos (checkout anónimo), sin SELECT.
-- La lectura de un pedido puntual pasa por tracking_token, resuelto
-- server-side con la service role key (ver src/lib/supabase/orders.ts).
create policy "public_insert_orders"
  on orders for insert
  with check (
    exists (
      select 1 from businesses b
      where b.id = orders.business_id and b.is_active = true
    )
  );

-- Escritura pública: INSERT de mensajes de ayuda (formulario "Déjanos un
-- mensaje" del catálogo), sin SELECT — solo el dueño los lee en /admin.
create policy "public_insert_support_messages"
  on support_messages for insert
  with check (
    exists (
      select 1 from businesses b
      where b.id = support_messages.business_id and b.is_active = true
    )
  );

-- Panel de administración: el dueño gestiona únicamente sus propios datos.
create policy "owner_manage_own_business"
  on businesses for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner_manage_own_categories"
  on categories for all
  using (exists (select 1 from businesses b where b.id = categories.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = categories.business_id and b.owner_id = auth.uid()));

create policy "owner_manage_own_products"
  on products for all
  using (exists (select 1 from businesses b where b.id = products.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = products.business_id and b.owner_id = auth.uid()));

create policy "owner_read_own_orders"
  on orders for select
  using (exists (select 1 from businesses b where b.id = orders.business_id and b.owner_id = auth.uid()));

-- Permite al dueño actualizar sus pedidos (el panel solo envía
-- delivery_status, ver src/lib/supabase/admin.ts#updateOrderDeliveryStatus;
-- RLS de Postgres no restringe por columna, así que esa disciplina es de
-- la app, no de la base).
create policy "owner_update_own_order_delivery_status"
  on orders for update
  using (exists (select 1 from businesses b where b.id = orders.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = orders.business_id and b.owner_id = auth.uid()));

create policy "owner_manage_own_support_messages"
  on support_messages for all
  using (exists (select 1 from businesses b where b.id = support_messages.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = support_messages.business_id and b.owner_id = auth.uid()));

-- business_payment_settings: sin política pública. Solo el dueño (para
-- editarla desde /admin) y la service role key (para el route handler de
-- checkout) pueden leerla — la anon key jamás puede.
create policy "owner_manage_own_payment_settings"
  on business_payment_settings for all
  using (exists (select 1 from businesses b where b.id = business_payment_settings.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = business_payment_settings.business_id and b.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: bucket público de fotos de producto/logo. Los objetos se guardan
-- bajo `{owner_id}/{business_id}/{uuid}.ext` — las políticas de INSERT/UPDATE/
-- DELETE exigen que el primer segmento de la ruta sea el uid autenticado.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "public_read_product_images"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "owner_upload_product_images"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owner_update_product_images"
  on storage.objects for update
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner_delete_product_images"
  on storage.objects for delete
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
