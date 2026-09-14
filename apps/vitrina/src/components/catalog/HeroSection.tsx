import Image from 'next/image';
import { Clock, MapPin } from 'lucide-react';
import type { Business } from '@/lib/types';

export function HeroSection({ business }: { business: Business }) {
  const title = business.heroTitle || business.name;
  const hasHeroImage = Boolean(business.heroImageUrl);
  const hasSubtitle = Boolean(business.heroSubtitle);
  const hasHours = business.businessHours.length > 0;
  const hasAddress = business.hasPhysicalStore && Boolean(business.address);
  const hasRadius = business.hasPhysicalStore && business.deliveryRadiusKm !== null;
  const hasDetails = hasHours || hasAddress || hasRadius;

  if (!hasHeroImage && !hasSubtitle && !hasDetails && !business.heroTitle) return null;

  return (
    <section className="bg-neutral-50 pb-4">
      {/* Portada: foto si hay, degradado de marca si no — nunca un banner vacío. */}
      <div className="relative h-28 w-full overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-800 sm:h-36">
        {hasHeroImage ? (
          <Image src={business.heroImageUrl!} alt="" fill sizes="100vw" className="object-cover" priority />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </div>

      <div className="mx-auto max-w-2xl px-4">
        {/* Tarjeta de perfil superpuesta a la portada, con el logo asomando arriba. */}
        <div className="-mt-8 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-900/5">
          <div className="flex items-start gap-3">
            {business.logoUrl ? (
              <Image
                src={business.logoUrl}
                alt=""
                width={56}
                height={56}
                className="-mt-9 h-14 w-14 shrink-0 rounded-2xl border-[3px] border-white object-cover shadow-sm"
              />
            ) : (
              <div className="-mt-9 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-[3px] border-white bg-emerald-600 text-xl font-bold text-white shadow-sm">
                {title.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 pt-0.5">
              <h1 className="truncate text-base font-bold leading-tight text-neutral-900">{title}</h1>
              {hasSubtitle ? (
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-neutral-500">{business.heroSubtitle}</p>
              ) : null}
            </div>
          </div>

          {hasDetails ? (
            <div className="mt-3 space-y-1.5 border-t border-neutral-100 pt-3">
              {hasHours
                ? business.businessHours.map((hour, index) => (
                    <div key={index} className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-neutral-500">
                        <Clock className="h-3 w-3 shrink-0" />
                        {hour.day}
                      </span>
                      <span className="shrink-0 font-medium text-neutral-700">{hour.time}</span>
                    </div>
                  ))
                : null}

              {hasAddress || hasRadius ? (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {hasAddress ? (
                    <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {business.address}
                    </span>
                  ) : null}
                  {hasRadius ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      Entrega hasta {business.deliveryRadiusKm} km
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
