'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Category, Product } from '@/lib/types';
import { SearchBar } from '@/components/catalog/SearchBar';
import { CategoryFilter } from '@/components/catalog/CategoryFilter';
import { ProductCard } from '@/components/catalog/ProductCard';
import { useCartStore } from '@/store/cart-store';

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

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = categoryId === null || product.categoryId === categoryId;
      const matchesSearch = term === '' || product.name.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [products, search, categoryId]);

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-3">
      <SearchBar value={search} onChange={setSearch} />
      <CategoryFilter categories={categories} selected={categoryId} onSelect={setCategoryId} />

      {filteredProducts.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          No encontramos productos con ese criterio.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 pb-28 sm:grid-cols-2">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}
