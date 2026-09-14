'use client';

import { ChevronRight } from 'lucide-react';
import { ProductCard } from '@/components/catalog/ProductCard';
import type { Product } from '@/lib/types';

const PREVIEW_COUNT = 6;

export function CategorySection({
  title,
  products,
  currency,
  onSeeAll,
}: {
  title: string;
  products: Product[];
  currency: string;
  onSeeAll: () => void;
}) {
  if (products.length === 0) return null;

  const preview = products.slice(0, PREVIEW_COUNT);
  const hasMore = products.length > preview.length;

  return (
    <section>
      <div className="flex items-center justify-between px-0.5">
        <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
        {hasMore ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600"
          >
            Ver todo
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {preview.map((product) => (
          <div key={product.id} className="w-[42vw] shrink-0 sm:w-36">
            <ProductCard product={product} currency={currency} />
          </div>
        ))}
        {hasMore ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="flex w-[28vw] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-200 text-xs font-semibold text-neutral-500 sm:w-24"
          >
            <ChevronRight className="h-5 w-5" />
            Ver todo
          </button>
        ) : null}
      </div>
    </section>
  );
}
