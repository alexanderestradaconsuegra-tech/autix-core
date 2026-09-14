'use client';

import { useState, type FormEvent } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { ImageUploader } from '@/components/admin/ImageUploader';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Business, BusinessHour } from '@/lib/types';

export interface HeroPatch {
  heroImageUrl: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  businessHours: BusinessHour[];
  hasPhysicalStore: boolean;
  address: string | null;
  addressLat: number | null;
  addressLng: number | null;
  deliveryRadiusKm: number | null;
}

export function HeroSettingsForm({
  business,
  onUploadHeroImage,
  onSaveHero,
}: {
  business: Business;
  onUploadHeroImage: (file: File) => Promise<string>;
  onSaveHero: (patch: HeroPatch) => Promise<void>;
}) {
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(business.heroImageUrl);
  const [heroTitle, setHeroTitle] = useState(business.heroTitle ?? '');
  const [heroSubtitle, setHeroSubtitle] = useState(business.heroSubtitle ?? '');
  const [hours, setHours] = useState<BusinessHour[]>(
    business.businessHours.length > 0 ? business.businessHours : [{ day: 'Lunes a sábado', time: '9:00 am - 7:00 pm' }],
  );
  const [hasPhysicalStore, setHasPhysicalStore] = useState(business.hasPhysicalStore);
  const [address, setAddress] = useState(business.address ?? '');
  const [addressLat, setAddressLat] = useState<number | null>(business.addressLat);
  const [addressLng, setAddressLng] = useState<number | null>(business.addressLng);
  const [radiusKm, setRadiusKm] = useState(business.deliveryRadiusKm != null ? String(business.deliveryRadiusKm) : '');

  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocodeNotice, setGeocodeNotice] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateHourRow(index: number, patch: Partial<BusinessHour>) {
    setHours((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  }

  function removeHourRow(index: number) {
    setHours((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGeocode() {
    if (address.trim().length < 3) {
      setGeocodeError('Ingresa una dirección primero.');
      return;
    }
    setGeocodeError(null);
    setGeocodeNotice(null);
    setGeocoding(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Tu sesión expiró, vuelve a iniciar sesión.');

      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = (await response.json()) as { lat?: number; lng?: number; formattedAddress?: string; error?: string };
      if (!response.ok || data.lat == null || data.lng == null) {
        throw new Error(data.error ?? 'No pudimos ubicar esa dirección.');
      }

      setAddressLat(data.lat);
      setAddressLng(data.lng);
      if (data.formattedAddress) setAddress(data.formattedAddress);
      setGeocodeNotice(`Ubicado: ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`);
    } catch (err) {
      setGeocodeError(err instanceof Error ? err.message : 'No pudimos ubicar esa dirección.');
    } finally {
      setGeocoding(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      const parsedRadius = radiusKm.trim() === '' ? null : Number(radiusKm);
      if (parsedRadius !== null && (!Number.isFinite(parsedRadius) || parsedRadius <= 0)) {
        throw new Error('El radio de entrega debe ser un número mayor a 0.');
      }

      await onSaveHero({
        heroImageUrl,
        heroTitle: heroTitle.trim() || null,
        heroSubtitle: heroSubtitle.trim() || null,
        businessHours: hours.filter((h) => h.day.trim() || h.time.trim()),
        hasPhysicalStore,
        address: hasPhysicalStore ? address.trim() || null : null,
        addressLat: hasPhysicalStore ? addressLat : null,
        addressLng: hasPhysicalStore ? addressLng : null,
        deliveryRadiusKm: hasPhysicalStore ? parsedRadius : null,
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'No pudimos guardar el hero.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-900">Portada del catálogo</h3>
      <p className="text-xs text-neutral-500">
        Se muestra como un hero pequeño arriba de tus productos, con foto, título, subtítulo y horario.
      </p>

      <div>
        <p className="mb-1 text-xs font-medium text-neutral-600">Foto de portada</p>
        <ImageUploader
          value={heroImageUrl}
          onUpload={async (file) => {
            const url = await onUploadHeroImage(file);
            setHeroImageUrl(url);
            return url;
          }}
        />
      </div>

      <div>
        <label htmlFor="hero-title" className="mb-1 block text-xs font-medium text-neutral-600">
          Título del hero
        </label>
        <input
          id="hero-title"
          value={heroTitle}
          onChange={(e) => setHeroTitle(e.target.value)}
          placeholder={business.name}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </div>

      <div>
        <label htmlFor="hero-subtitle" className="mb-1 block text-xs font-medium text-neutral-600">
          Subtítulo del hero
        </label>
        <input
          id="hero-subtitle"
          value={heroSubtitle}
          onChange={(e) => setHeroSubtitle(e.target.value)}
          placeholder="Quesos y lácteos frescos todos los días"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-neutral-600">Horario de atención</p>
        <div className="space-y-2">
          {hours.map((hour, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={hour.day}
                onChange={(e) => updateHourRow(index, { day: e.target.value })}
                placeholder="Lunes a viernes"
                className="w-1/2 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <input
                value={hour.time}
                onChange={(e) => updateHourRow(index, { time: e.target.value })}
                placeholder="9:00 am - 7:00 pm"
                className="w-1/2 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => removeHourRow(index)}
                aria-label="Quitar horario"
                className="shrink-0 text-neutral-300 active:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setHours((prev) => [...prev, { day: '', time: '' }])}
          className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar horario
        </button>
      </div>

      <label className="flex items-center gap-2 border-t border-neutral-100 pt-3 text-xs font-medium text-neutral-600">
        <input
          type="checkbox"
          checked={hasPhysicalStore}
          onChange={(e) => setHasPhysicalStore(e.target.checked)}
        />
        Tenemos tienda física (un local al que los clientes pueden ir)
      </label>

      {hasPhysicalStore ? (
        <>
          <div>
            <label htmlFor="hero-address" className="mb-1 block text-xs font-medium text-neutral-600">
              Dirección del negocio
            </label>
            <div className="flex gap-2">
              <input
                id="hero-address"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setAddressLat(null);
                  setAddressLng(null);
                  setGeocodeNotice(null);
                }}
                placeholder="Cra 15 #12-34, Bogotá"
                className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => void handleGeocode()}
                disabled={geocoding}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-60"
              >
                <MapPin className="h-3.5 w-3.5" />
                {geocoding ? 'Buscando...' : 'Ubicar'}
              </button>
            </div>
            {geocodeError ? <p className="mt-1 text-xs font-medium text-red-500">{geocodeError}</p> : null}
            {geocodeNotice ? <p className="mt-1 text-xs font-medium text-emerald-600">{geocodeNotice}</p> : null}
            {!geocodeNotice && addressLat !== null && addressLng !== null ? (
              <p className="mt-1 text-xs text-neutral-400">
                Ubicado: {addressLat.toFixed(5)}, {addressLng.toFixed(5)}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="hero-radius" className="mb-1 block text-xs font-medium text-neutral-600">
              Radio de entrega (km, opcional)
            </label>
            <input
              id="hero-radius"
              type="number"
              min="0.1"
              step="0.1"
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
              placeholder="5"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Se muestra como &ldquo;Entrega hasta X km&rdquo; en el catálogo. Por ahora es informativo, no bloquea
              pedidos fuera del radio.
            </p>
          </div>
        </>
      ) : null}

      {saveError ? <p className="text-xs font-medium text-red-500">{saveError}</p> : null}
      {saved ? <p className="text-xs font-medium text-emerald-600">Cambios guardados.</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? 'Guardando...' : 'Guardar portada'}
      </button>
    </form>
  );
}
