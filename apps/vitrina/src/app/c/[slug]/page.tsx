import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCatalogBySlug } from '@/lib/supabase/server';
import { CatalogHeader } from '@/components/catalog/CatalogHeader';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { CartSheet } from '@/components/catalog/CartSheet';

// ISR: el catálogo se sirve estático y se revalida cada 60s — el dueño edita
// productos en /admin y el cambio se refleja sin necesitar un redeploy.
export const revalidate = 60;

type CatalogPageParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: CatalogPageParams): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getCatalogBySlug(slug);

  if (!catalog) {
    return { title: 'Catálogo no encontrado' };
  }

  return {
    title: catalog.business.name,
    description:
      catalog.business.welcomeMessage ?? `Catálogo de productos de ${catalog.business.name}`,
  };
}

export default async function CatalogPage({ params }: CatalogPageParams) {
  const { slug } = await params;
  const catalog = await getCatalogBySlug(slug);

  if (!catalog) notFound();

  const { business, categories, products } = catalog;

  return (
    <main className="min-h-dvh bg-neutral-50">
      <CatalogHeader business={business} />
      <ProductGrid slug={slug} products={products} categories={categories} currency={business.currency} />
      <CartSheet business={business} />
    </main>
  );
}
