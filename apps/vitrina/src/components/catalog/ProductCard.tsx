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
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="relative aspect-square w-full bg-neutral-100">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 45vw, 220px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-300">
            <ImageOff className="h-7 w-7" />
          </div>
        )}
        {outOfStock ? (
          <div className="absolute inset-x-0 bottom-0 bg-black/65 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-white">
            Agotado
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <h3 className="line-clamp-2 text-xs font-medium leading-tight text-neutral-900">{product.name}</h3>

        <div className="mt-auto flex items-center justify-between gap-1.5">
          <span className="text-sm font-bold text-neutral-900">{formatCurrency(product.price, currency)}</span>

          {outOfStock ? null : quantity === 0 ? (
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
              aria-label={`Agregar ${product.name}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white active:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-1 py-1 text-white">
              <button
                type="button"
                onClick={() => decrementItem(product.id)}
                aria-label="Quitar uno"
                className="flex h-5 w-5 items-center justify-center rounded-full active:bg-emerald-700"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-3 text-center text-xs font-semibold">{quantity}</span>
              <button
                type="button"
                onClick={() => incrementItem(product.id)}
                aria-label="Agregar uno"
                className="flex h-5 w-5 items-center justify-center rounded-full active:bg-emerald-700"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
