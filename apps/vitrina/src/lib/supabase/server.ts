import { createClient } from '@supabase/supabase-js';
import type { Business, CatalogData, Category, Product } from '@/lib/types';

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL no está configurada.');
  return url;
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY no está configurada.');
  return key;
}

/**
 * Cliente con la anon key: toda lectura pasa por las políticas RLS de
 * lectura pública (ver sql/schema.sql). Nunca usar la service role key acá.
 */
export function createSupabaseServerClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false },
  });
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

export async function getCatalogBySlug(slug: string): Promise<CatalogData | null> {
  const supabase = createSupabaseServerClient();

  const { data: businessRow, error: businessError } = await supabase
    .from('businesses')
    .select(
      'id, slug, name, phone, currency, logo_url, welcome_message, is_active, accepts_mercadopago, google_reviews_url',
    )
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
    .returns<BusinessRow>();

  if (businessError) {
    throw new Error(`Error consultando el negocio: ${businessError.message}`);
  }
  if (!businessRow) return null;

  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, sort_order')
      .eq('business_id', businessRow.id)
      .order('sort_order', { ascending: true })
      .returns<CategoryRow[]>(),
    supabase
      .from('products')
      .select('id, category_id, name, description, price, image_url, stock, is_available, sort_order')
      .eq('business_id', businessRow.id)
      .eq('is_available', true)
      .order('sort_order', { ascending: true })
      .returns<ProductRow[]>(),
  ]);

  if (categoriesResult.error) {
    throw new Error(`Error consultando categorías: ${categoriesResult.error.message}`);
  }
  if (productsResult.error) {
    throw new Error(`Error consultando productos: ${productsResult.error.message}`);
  }

  const business: Business = {
    id: businessRow.id,
    slug: businessRow.slug,
    name: businessRow.name,
    phone: businessRow.phone,
    currency: businessRow.currency,
    logoUrl: businessRow.logo_url,
    welcomeMessage: businessRow.welcome_message,
    isActive: businessRow.is_active,
    acceptsMercadopago: businessRow.accepts_mercadopago,
    googleReviewsUrl: businessRow.google_reviews_url,
  };

  const categories: Category[] = (categoriesResult.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sort_order,
  }));

  const products: Product[] = (productsResult.data ?? []).map((p) => ({
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

  return { business, categories, products };
}
