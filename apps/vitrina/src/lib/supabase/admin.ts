'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Business, BusinessHour, Category, Product } from '@/lib/types';

export interface PaymentSettings {
  mercadopagoAccessToken: string | null;
  mercadopagoEnabled: boolean;
}

interface BusinessRow {
  id: string;
  slug: string;
  name: string;
  phone: string;
  currency: string;
  logo_url: string | null;
  welcome_message: string | null;
  is_active: boolean;
  accepts_mercadopago: boolean;
  google_reviews_url: string | null;
  hero_image_url: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  business_hours: BusinessHour[];
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
  delivery_radius_km: number | null;
}

interface CategoryRow {
  id: string;
  name: string;
  sort_order: number;
}

interface ProductRow {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  stock: number | null;
  is_available: boolean;
  sort_order: number;
}

interface PaymentSettingsRow {
  mercadopago_access_token: string | null;
  mercadopago_enabled: boolean;
}

const BUSINESS_COLUMNS =
  'id, slug, name, phone, currency, logo_url, welcome_message, is_active, accepts_mercadopago, ' +
  'google_reviews_url, hero_image_url, hero_title, hero_subtitle, business_hours, address, ' +
  'address_lat, address_lng, delivery_radius_km';

function mapBusinessRow(row: BusinessRow): Business {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    phone: row.phone,
    currency: row.currency,
    logoUrl: row.logo_url,
    welcomeMessage: row.welcome_message,
    isActive: row.is_active,
    acceptsMercadopago: row.accepts_mercadopago,
    googleReviewsUrl: row.google_reviews_url,
    heroImageUrl: row.hero_image_url,
    heroTitle: row.hero_title,
    heroSubtitle: row.hero_subtitle,
    businessHours: row.business_hours,
    address: row.address,
    addressLat: row.address_lat,
    addressLng: row.address_lng,
    deliveryRadiusKm: row.delivery_radius_km !== null ? Number(row.delivery_radius_km) : null,
  };
}

export async function getOwnedBusiness(ownerId: string): Promise<Business | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('businesses')
    .select(BUSINESS_COLUMNS)
    .eq('owner_id', ownerId)
    .maybeSingle()
    .returns<BusinessRow>();

  if (error) throw new Error(error.message);
  return data ? mapBusinessRow(data) : null;
}

export async function createBusiness(
  ownerId: string,
  input: { slug: string; name: string; phone: string; currency: string },
): Promise<Business> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('businesses')
    .insert({ owner_id: ownerId, slug: input.slug, name: input.name, phone: input.phone, currency: input.currency })
    .select(BUSINESS_COLUMNS)
    .single()
    .returns<BusinessRow>();

  if (error) throw new Error(error.message);
  return mapBusinessRow(data);
}

export async function updateBusiness(
  businessId: string,
  patch: Partial<{
    name: string;
    phone: string;
    currency: string;
    logoUrl: string | null;
    welcomeMessage: string | null;
    isActive: boolean;
    googleReviewsUrl: string | null;
    heroImageUrl: string | null;
    heroTitle: string | null;
    heroSubtitle: string | null;
    businessHours: BusinessHour[];
    address: string | null;
    addressLat: number | null;
    addressLng: number | null;
    deliveryRadiusKm: number | null;
  }>,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
  if (patch.welcomeMessage !== undefined) row.welcome_message = patch.welcomeMessage;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.googleReviewsUrl !== undefined) row.google_reviews_url = patch.googleReviewsUrl;
  if (patch.heroImageUrl !== undefined) row.hero_image_url = patch.heroImageUrl;
  if (patch.heroTitle !== undefined) row.hero_title = patch.heroTitle;
  if (patch.heroSubtitle !== undefined) row.hero_subtitle = patch.heroSubtitle;
  if (patch.businessHours !== undefined) row.business_hours = patch.businessHours;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.addressLat !== undefined) row.address_lat = patch.addressLat;
  if (patch.addressLng !== undefined) row.address_lng = patch.addressLng;
  if (patch.deliveryRadiusKm !== undefined) row.delivery_radius_km = patch.deliveryRadiusKm;

  const { error } = await supabase.from('businesses').update(row).eq('id', businessId);
  if (error) throw new Error(error.message);
}

export async function getPaymentSettings(businessId: string): Promise<PaymentSettings> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('business_payment_settings')
    .select('mercadopago_access_token, mercadopago_enabled')
    .eq('business_id', businessId)
    .maybeSingle()
    .returns<PaymentSettingsRow>();

  if (error) throw new Error(error.message);
  return {
    mercadopagoAccessToken: data?.mercadopago_access_token ?? null,
    mercadopagoEnabled: data?.mercadopago_enabled ?? false,
  };
}

export async function savePaymentSettings(businessId: string, settings: PaymentSettings): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  const { error } = await supabase.from('business_payment_settings').upsert({
    business_id: businessId,
    mercadopago_access_token: settings.mercadopagoAccessToken,
    mercadopago_enabled: settings.mercadopagoEnabled,
  });
  if (error) throw new Error(error.message);

  // Espejo público sin secretos: la vista /c/[slug] lo lee para decidir si
  // muestra el botón de Mercado Pago, sin poder leer el access token.
  const { error: businessError } = await supabase
    .from('businesses')
    .update({ accepts_mercadopago: settings.mercadopagoEnabled })
    .eq('id', businessId);
  if (businessError) throw new Error(businessError.message);
}

export async function listCategories(businessId: string): Promise<Category[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, sort_order')
    .eq('business_id', businessId)
    .order('sort_order', { ascending: true })
    .returns<CategoryRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, sortOrder: c.sort_order }));
}

export async function listAllProducts(businessId: string): Promise<Product[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, category_id, name, description, price, image_url, stock, is_available, sort_order')
    .eq('business_id', businessId)
    .order('sort_order', { ascending: true })
    .returns<ProductRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    categoryId: p.category_id,
    name: p.name,
    description: p.description,
    price: Number(p.price),
    imageUrl: p.image_url,
    stock: p.stock,
    isAvailable: p.is_available,
    sortOrder: p.sort_order,
  }));
}

export async function upsertProduct(
  businessId: string,
  product: {
    id?: string;
    name: string;
    description: string | null;
    price: number;
    categoryId: string | null;
    imageUrl: string | null;
    stock: number | null;
    isAvailable: boolean;
  },
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const row = {
    business_id: businessId,
    category_id: product.categoryId,
    name: product.name,
    description: product.description,
    price: product.price,
    image_url: product.imageUrl,
    stock: product.stock,
    is_available: product.isAvailable,
  };

  const { error } = product.id
    ? await supabase.from('products').update(row).eq('id', product.id)
    : await supabase.from('products').insert(row);

  if (error) throw new Error(error.message);
}

export async function deleteProduct(productId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) throw new Error(error.message);
}

/**
 * Sube una foto (producto o logo) a Storage bajo `{uid}/{businessId}/{uuid}.ext`
 * — las políticas de `storage.objects` (sql/schema.sql) exigen que el primer
 * segmento de la ruta sea el uid autenticado.
 */
export async function uploadProductImage(businessId: string, file: File): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('Tu sesión expiró, vuelve a iniciar sesión.');
  }

  const extension = file.name.split('.').pop() ?? 'jpg';
  const path = `${userData.user.id}/${businessId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from('product-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Pedidos: el panel solo lee y avanza delivery_status (owner_update_own_order_
// delivery_status en sql/schema.sql) — nunca reescribe monto, items o datos
// del cliente.
// ---------------------------------------------------------------------------

export type DeliveryStatus = 'received' | 'preparing' | 'out_for_delivery' | 'delivered';

export interface AdminOrder {
  id: string;
  customerName: string;
  customerAddress: string | null;
  items: { productId: string; name: string; price: number; quantity: number }[];
  total: number;
  paymentMethod: 'whatsapp' | 'mercadopago';
  deliveryStatus: DeliveryStatus;
  createdAt: string;
}

interface OrderRow {
  id: string;
  customer_name: string;
  customer_address: string | null;
  items: AdminOrder['items'];
  total: number;
  payment_method: AdminOrder['paymentMethod'];
  delivery_status: DeliveryStatus;
  created_at: string;
}

export async function listOrders(businessId: string): Promise<AdminOrder[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_name, customer_address, items, total, payment_method, delivery_status, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .returns<OrderRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map((o) => ({
    id: o.id,
    customerName: o.customer_name,
    customerAddress: o.customer_address,
    items: o.items,
    total: Number(o.total),
    paymentMethod: o.payment_method,
    deliveryStatus: o.delivery_status,
    createdAt: o.created_at,
  }));
}

export async function updateOrderDeliveryStatus(orderId: string, status: DeliveryStatus): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('orders').update({ delivery_status: status }).eq('id', orderId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Mensajes de ayuda ("Déjanos un mensaje" del catálogo público).
// ---------------------------------------------------------------------------

export interface AdminSupportMessage {
  id: string;
  customerName: string;
  message: string;
  resolved: boolean;
  createdAt: string;
}

interface SupportMessageRow {
  id: string;
  customer_name: string;
  message: string;
  resolved: boolean;
  created_at: string;
}

export async function listSupportMessages(businessId: string): Promise<AdminSupportMessage[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('support_messages')
    .select('id, customer_name, message, resolved, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .returns<SupportMessageRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    id: m.id,
    customerName: m.customer_name,
    message: m.message,
    resolved: m.resolved,
    createdAt: m.created_at,
  }));
}

export async function resolveSupportMessage(messageId: string, resolved: boolean): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('support_messages').update({ resolved }).eq('id', messageId);
  if (error) throw new Error(error.message);
}
