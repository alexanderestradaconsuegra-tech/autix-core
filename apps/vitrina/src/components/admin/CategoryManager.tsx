'use client';

import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { createCategory, deleteCategory } from '@/lib/supabase/admin';
import type { Category } from '@/lib/types';

export function CategoryManager({
  businessId,
  categories,
  onChanged,
}: {
  businessId: string;
  categories: Category[];
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('El nombre de la categoría es muy corto.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await createCategory(businessId, trimmed, categories.length);
      setName('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos crear la categoría.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(category: Category) {
    if (!confirm(`¿Eliminar "${category.name}"? Sus productos quedarán sin categoría.`)) return;
    await deleteCategory(category.id);
    await onChanged();
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-900">Categorías</h3>
      <p className="mt-0.5 text-xs text-neutral-500">
        Se muestran como filtro arriba de tus productos en el catálogo público.
      </p>

      {categories.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((category) => (
            <span
              key={category.id}
              className="flex items-center gap-1.5 rounded-full bg-neutral-100 py-1.5 pl-3 pr-2 text-xs font-medium text-neutral-700"
            >
              {category.name}
              <button
                type="button"
                onClick={() => void handleDelete(category)}
                aria-label={`Eliminar ${category.name}`}
                className="text-neutral-400 active:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <form onSubmit={(e) => void handleAdd(e)} className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nueva categoría"
          className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </button>
      </form>
      {error ? <p className="mt-1 text-xs font-medium text-red-500">{error}</p> : null}
    </div>
  );
}
