'use client';

import { useState, type FormEvent } from 'react';
import { ImageUploader } from '@/components/admin/ImageUploader';
import type { Category, Product } from '@/lib/types';

export interface ProductInput {
  id?: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string | null;
  imageUrl: string | null;
  stock: number | null;
  isAvailable: boolean;
}

export function ProductForm({
  categories,
  initialProduct,
  onUploadImage,
  onSubmit,
  onCancel,
}: {
  categories: Category[];
  initialProduct?: Product;
  onUploadImage: (file: File) => Promise<string>;
  onSubmit: (product: ProductInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialProduct?.name ?? '');
  const [description, setDescription] = useState(initialProduct?.description ?? '');
  const [price, setPrice] = useState(initialProduct ? String(initialProduct.price) : '');
  const [categoryId, setCategoryId] = useState(initialProduct?.categoryId ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(initialProduct?.imageUrl ?? null);
  const [stock, setStock] = useState(initialProduct?.stock != null ? String(initialProduct.stock) : '');
  const [isAvailable, setIsAvailable] = useState(initialProduct?.isAvailable ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedPrice = Number(price);

    if (name.trim().length < 2) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError('Ingresa un precio válido.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        id: initialProduct?.id,
        name: name.trim(),
        description: description.trim() || null,
        price: parsedPrice,
        categoryId: categoryId || null,
        imageUrl,
        stock: stock.trim() === '' ? null : Number(stock),
        isAvailable,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <ImageUploader
        value={imageUrl}
        onUpload={async (file) => {
          const url = await onUploadImage(file);
          setImageUrl(url);
          return url;
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label htmlFor="prod-name" className="mb-1 block text-xs font-medium text-neutral-600">
            Nombre *
          </label>
          <input
            id="prod-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <div className="col-span-2">
          <label htmlFor="prod-desc" className="mb-1 block text-xs font-medium text-neutral-600">
            Descripción
          </label>
          <textarea
            id="prod-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="prod-price" className="mb-1 block text-xs font-medium text-neutral-600">
            Precio *
          </label>
          <input
            id="prod-price"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="prod-stock" className="mb-1 block text-xs font-medium text-neutral-600">
            Stock (opcional)
          </label>
          <input
            id="prod-stock"
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="Ilimitado"
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <div className="col-span-2">
          <label htmlFor="prod-category" className="mb-1 block text-xs font-medium text-neutral-600">
            Categoría
          </label>
          <select
            id="prod-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <label className="col-span-2 flex items-center gap-2 text-xs font-medium text-neutral-600">
          <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
          Disponible en el catálogo
        </label>
      </div>

      {error ? <p className="text-xs font-medium text-red-500">{error}</p> : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Guardando...' : 'Guardar producto'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
