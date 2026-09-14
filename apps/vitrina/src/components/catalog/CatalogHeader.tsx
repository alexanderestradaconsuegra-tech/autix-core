'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CircleHelp } from 'lucide-react';
import { HelpModal } from '@/components/catalog/HelpModal';
import type { Business } from '@/lib/types';

export function CatalogHeader({ business }: { business: Business }) {
  const [helpOpen, setHelpOpen] = useState(false);

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
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-neutral-900">{business.name}</h1>
          {business.welcomeMessage ? (
            <p className="truncate text-xs text-neutral-500">{business.welcomeMessage}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="Necesito ayuda"
          className="flex shrink-0 items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-500"
        >
          <CircleHelp className="h-3.5 w-3.5" />
          Ayuda
        </button>
      </div>

      {helpOpen ? <HelpModal business={business} onClose={() => setHelpOpen(false)} /> : null}
    </header>
  );
}
