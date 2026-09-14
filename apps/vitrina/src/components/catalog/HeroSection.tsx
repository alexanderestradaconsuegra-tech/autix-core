import Image from 'next/image';
import { MapPin } from 'lucide-react';
import type { Business } from '@/lib/types';

export function HeroSection({ business }: { business: Business }) {
  const hasHeroImage = Boolean(business.heroImageUrl);
  const hasTitle = Boolean(business.heroTitle);
  const hasSubtitle = Boolean(business.heroSubtitle);
  const hasHours = business.businessHours.length > 0;
  const hasAddress = business.hasPhysicalStore && Boolean(business.address);
  const hasRadius = business.hasPhysicalStore && business.deliveryRadiusKm !== null;

  if (!hasHeroImage && !hasTitle && !hasSubtitle && !hasHours && !hasAddress && !hasRadius) return null;

  return (
    <section className="border-b border-neutral-200 bg-white">
      {business.heroImageUrl ? (
        <div className="relative h-32 w-full sm:h-40">
          <Image src={business.heroImageUrl} alt="" fill sizes="100vw" className="object-cover" priority />
        </div>
      ) : null}

      <div className="mx-auto max-w-2xl space-y-2 px-4 py-4">
        {hasTitle ? <h2 className="text-lg font-bold text-neutral-900">{business.heroTitle}</h2> : null}
        {hasSubtitle ? <p className="text-sm text-neutral-500">{business.heroSubtitle}</p> : null}

        {hasHours ? (
          <ul className="space-y-0.5 pt-1">
            {business.businessHours.map((hour, index) => (
              <li key={index} className="flex justify-between gap-4 text-xs text-neutral-600">
                <span>{hour.day}</span>
                <span className="font-medium">{hour.time}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {hasAddress ? (
          <p className="flex items-center gap-1 text-xs text-neutral-600">
            <MapPin className="h-3 w-3 shrink-0 text-neutral-400" />
            {business.address}
          </p>
        ) : null}

        {hasRadius ? (
          <p className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <MapPin className="h-3 w-3" />
            Entrega hasta {business.deliveryRadiusKm} km
          </p>
        ) : null}
      </div>
    </section>
  );
}
