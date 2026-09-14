'use client';

import type { Category } from '@/lib/types';

export function CategoryFilter({
  categories,
  selected,
  onSelect,
}: {
  categories: Category[];
  selected: string | null;
  onSelect: (categoryId: string | null) => void;
}) {
  if (categories.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
          selected === null
            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/20'
            : 'border border-neutral-200 bg-white text-neutral-600'
        }`}
      >
        Todo
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(category.id)}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
            selected === category.id
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/20'
              : 'border border-neutral-200 bg-white text-neutral-600'
          }`}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
