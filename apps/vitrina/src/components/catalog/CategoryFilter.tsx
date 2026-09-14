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
        className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium ${
          selected === null ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
        }`}
      >
        Todos
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(category.id)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium ${
            selected === category.id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
