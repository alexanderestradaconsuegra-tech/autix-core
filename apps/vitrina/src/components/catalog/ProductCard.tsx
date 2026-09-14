'use client';

import Image from 'next/image';
import { ImageOff, Minus, Plus } from 'lucide-react';
import type { Product } from '@/lib/types';
import { formatCurrency } from '@/lib/currency';
import { useCartStore } from '@/store/cart-store';

export function ProductCard({ product, currency }: { product: Product; currency: string }) {
  const quantity = useCartStore(
    (s) => s.items.find((i) => i.productId === product.id)?.quantity ?? 0,
  );
  const addItem = useCartStore((s) => s.addItem);
  const incrementItem = useCartStore((s) => s.incrementItem);
  const decrementItem = useCartStore((s) => s.decrementItem);

  const outOfStock = product.stock !== null && product.stock <= 0;

  return (
    <div className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
        {product.imageUrl ? (
          <Image src={product.imageUrl} alt={product.name} fill sizes="80px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-300">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <h3 className="truncate text-sm font-medium text-neutral-900">{product.name}</h3>
          {product.description ? (
            <p className="line-clamp-2 text-xs text-neutral-500">{product.description}</p>
          ) : null}
        </div>

        <div className="mt-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-900">
            {formatCurrency(product.price, currency)}
          </span>

          {outOfStock ? (
            <span className="text-xs font-medium text-red-500">Agotado</span>
          ) : quantity === 0 ? (
            <button
              type="button"
              onClick={() =>
                addItem({
                  productId: product.id,
                  name: product.name,
                  price: product.price,
                  imageUrl: product.imageUrl,
                })
              }
              className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-emerald-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-full bg-emerald-600 px-1.5 py-1 text-white">
              <button
                type="button"
                onClick={() => decrementItem(product.id)}
                aria-label="Quitar uno"
                className="flex h-6 w-6 items-center justify-center rounded-full active:bg-emerald-700"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-4 text-center text-xs font-semibold">{quantity}</span>
              <button
                type="button"
                onClick={() => incrementItem(product.id)}
                aria-label="Agregar uno"
                className="flex h-6 w-6 items-center justify-center rounded-full active:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
