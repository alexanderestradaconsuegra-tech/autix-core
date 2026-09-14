-- WhatsApp Catalog Builder — esquema PostgreSQL/Supabase
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
-- orders: registro histórico de pedidos enviados a WhatsApp (analítica,
-- no reemplaza la conversación real que ocurre en WhatsApp).
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses (id) on delete cascade,
  customer_name     text not null,
  customer_address  text,
  items             jsonb not null,   -- [{ productId, name, price, quantity }]
  total             numeric(12, 2) not null check (total >= 0),
  status            text not null default 'sent' check (status in ('sent', 'confirmed', 'cancelled')),
  created_at        timestamptz not null default now()
);

create index if not exists orders_business_id_idx on orders (business_id, created_at desc);

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
alter table businesses enable row level security;
alter table categories enable row level security;
alter table products   enable row level security;
alter table orders     enable row level security;

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
create policy "public_insert_orders"
  on orders for insert
  with check (
    exists (
      select 1 from businesses b
      where b.id = orders.business_id and b.is_active = true
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
