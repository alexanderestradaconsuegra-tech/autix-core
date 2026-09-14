import Image from 'next/image';
import type { Business } from '@/lib/types';

export function CatalogHeader({ business }: { business: Business }) {
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        {business.logoUrl ? (
          <Image
            src={business.logoUrl}
            alt={business.name}
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-lg font-semibold text-white">
            {business.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-neutral-900">{business.name}</h1>
          {business.welcomeMessage ? (
            <p className="truncate text-xs text-neutral-500">{business.welcomeMessage}</p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
