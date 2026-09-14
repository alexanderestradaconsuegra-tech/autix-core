'use client';

import { Search } from 'lucide-react';

export function SearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar producto..."
        className="w-full rounded-full border border-neutral-200 bg-neutral-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:bg-white"
      />
    </div>
  );
}
