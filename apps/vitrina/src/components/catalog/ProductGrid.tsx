'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Category, Product } from '@/lib/types';
import { SearchBar } from '@/components/catalog/SearchBar';
import { CategoryFilter } from '@/components/catalog/CategoryFilter';
import { CategorySection } from '@/components/catalog/CategorySection';
import { ProductCard } from '@/components/catalog/ProductCard';
import { useCartStore } from '@/store/cart-store';

const UNCATEGORIZED_ID = '__uncategorized__';

export function ProductGrid({
  slug,
  products,
  categories,
  currency,
}: {
  slug: string;
  products: Product[];
  categories: Category[];
  currency: string;
}) {
  const setBusinessSlug = useCartStore((s) => s.setBusinessSlug);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    setBusinessSlug(slug);
  }, [slug, setBusinessSlug]);

  const hasUncategorized = useMemo(() => products.some((p) => p.categoryId === null), [products]);

  const filterChips = useMemo(
    () => (hasUncategorized ? [...categories, { id: UNCATEGORIZED_ID, name: 'Otros', sortOrder: Infinity }] : categories),
    [categories, hasUncategorized],
  );

  // Modo "explorar": sin búsqueda ni categoría activa, se navega por
  // secciones horizontales (evita un solo scroll infinito con todo mezclado,
  // como en un feed de e-commerce). Buscar o tocar una categoría entra en
  // modo "filtrado": grid completo de esos resultados.
  const isBrowsing = search.trim() === '' && categoryId === null;

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory =
        categoryId === null
          ? true
          : categoryId === UNCATEGORIZED_ID
            ? product.categoryId === null
            : product.categoryId === categoryId;
      const matchesSearch = term === '' || product.name.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [products, search, categoryId]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-3">
      <SearchBar value={search} onChange={setSearch} />
      <CategoryFilter categories={filterChips} selected={categoryId} onSelect={setCategoryId} />

      {isBrowsing ? (
        <div className="space-y-5 pb-28">
          {categories.map((category) => (
            <CategorySection
              key={category.id}
              title={category.name}
              products={products.filter((p) => p.categoryId === category.id)}
              currency={currency}
              onSeeAll={() => setCategoryId(category.id)}
            />
          ))}
          {hasUncategorized ? (
            <CategorySection
              title="Otros"
              products={products.filter((p) => p.categoryId === null)}
              currency={currency}
              onSeeAll={() => setCategoryId(UNCATEGORIZED_ID)}
            />
          ) : null}
          {products.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-400">Este catálogo todavía no tiene productos.</p>
          ) : null}
        </div>
      ) : filteredProducts.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          No encontramos productos con ese criterio.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 pb-28 sm:grid-cols-3">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}
