'use client';

import Image from 'next/image';
import { ImageOff, Pencil, Trash2 } from 'lucide-react';
import type { Product } from '@/lib/types';
import { formatCurrency } from '@/lib/currency';

export function ProductList({
  products,
  currency,
  onEdit,
  onDelete,
}: {
  products: Product[];
  currency: string;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}) {
  if (products.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-400">Todavía no agregaste productos.</p>;
  }

  return (
    <ul className="space-y-2">
      {products.map((product) => (
        <li key={product.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
            {product.imageUrl ? (
              <Image src={product.imageUrl} alt={product.name} fill sizes="48px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-neutral-300">
                <ImageOff className="h-4 w-4" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900">{product.name}</p>
            <p className="text-xs text-neutral-500">
              {formatCurrency(product.price, currency)}
              {product.isAvailable ? '' : ' · oculto'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onEdit(product)}
            aria-label={`Editar ${product.name}`}
            className="text-neutral-400 active:text-emerald-600"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(product)}
            aria-label={`Eliminar ${product.name}`}
            className="text-neutral-400 active:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
