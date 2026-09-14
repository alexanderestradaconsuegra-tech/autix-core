'use client';

import { useState, type FormEvent } from 'react';
import { ImageUploader } from '@/components/admin/ImageUploader';
import type { PaymentSettings } from '@/lib/supabase/admin';
import type { Business } from '@/lib/types';

const CURRENCIES = ['USD', 'EUR', 'CLP', 'MXN', 'COP', 'PEN', 'ARS', 'BRL'];

export function BusinessSettingsForm({
  business,
  paymentSettings,
  onUploadLogo,
  onSaveBusiness,
  onSavePayment,
}: {
  business: Business;
  paymentSettings: PaymentSettings;
  onUploadLogo: (file: File) => Promise<string>;
  onSaveBusiness: (patch: {
    name: string;
    phone: string;
    currency: string;
    logoUrl: string | null;
    welcomeMessage: string | null;
    googleReviewsUrl: string | null;
  }) => Promise<void>;
  onSavePayment: (settings: PaymentSettings) => Promise<void>;
}) {
  const [name, setName] = useState(business.name);
  const [phone, setPhone] = useState(business.phone);
  const [currency, setCurrency] = useState(business.currency);
  const [logoUrl, setLogoUrl] = useState<string | null>(business.logoUrl);
  const [welcomeMessage, setWelcomeMessage] = useState(business.welcomeMessage ?? '');
  const [googleReviewsUrl, setGoogleReviewsUrl] = useState(business.googleReviewsUrl ?? '');
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [businessSaved, setBusinessSaved] = useState(false);

  const [mpToken, setMpToken] = useState(paymentSettings.mercadopagoAccessToken ?? '');
  const [mpEnabled, setMpEnabled] = useState(paymentSettings.mercadopagoEnabled);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);

  async function handleBusinessSubmit(event: FormEvent) {
    event.preventDefault();
    setBusinessError(null);
    setBusinessSaved(false);
    setSavingBusiness(true);
    try {
      await onSaveBusiness({
        name: name.trim(),
        phone: phone.trim(),
        currency,
        logoUrl,
        welcomeMessage: welcomeMessage.trim() || null,
        googleReviewsUrl: googleReviewsUrl.trim() || null,
      });
      setBusinessSaved(true);
    } catch (err) {
      setBusinessError(err instanceof Error ? err.message : 'No pudimos guardar los datos del negocio.');
    } finally {
      setSavingBusiness(false);
    }
  }

  async function handlePaymentSubmit(event: FormEvent) {
    event.preventDefault();
    setPaymentError(null);
    setPaymentSaved(false);
    setSavingPayment(true);
    try {
      await onSavePayment({ mercadopagoAccessToken: mpToken.trim() || null, mercadopagoEnabled: mpEnabled });
      setPaymentSaved(true);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'No pudimos guardar la configuración de pago.');
    } finally {
      setSavingPayment(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void handleBusinessSubmit(e)} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">Datos del negocio</h3>

        <ImageUploader
          value={logoUrl}
          onUpload={async (file) => {
            const url = await onUploadLogo(file);
            setLogoUrl(url);
            return url;
          }}
        />

        <div>
          <label htmlFor="biz-name" className="mb-1 block text-xs font-medium text-neutral-600">
            Nombre del negocio
          </label>
          <input
            id="biz-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="biz-phone" className="mb-1 block text-xs font-medium text-neutral-600">
            WhatsApp (código de país + número, solo dígitos)
          </label>
          <input
            id="biz-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="573001234567"
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="biz-currency" className="mb-1 block text-xs font-medium text-neutral-600">
            Moneda
          </label>
          <select
            id="biz-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="biz-welcome" className="mb-1 block text-xs font-medium text-neutral-600">
            Mensaje de bienvenida
          </label>
          <textarea
            id="biz-welcome"
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="biz-reviews" className="mb-1 block text-xs font-medium text-neutral-600">
            Link de reseñas de Google (opcional)
          </label>
          <input
            id="biz-reviews"
            value={googleReviewsUrl}
            onChange={(e) => setGoogleReviewsUrl(e.target.value)}
            placeholder="https://g.page/r/.../review"
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <p className="mt-1 text-xs text-neutral-400">
            Lo buscas en Google Maps: tu negocio → Compartir → Pedir reseñas.
          </p>
        </div>

        {businessError ? <p className="text-xs font-medium text-red-500">{businessError}</p> : null}
        {businessSaved ? <p className="text-xs font-medium text-emerald-600">Cambios guardados.</p> : null}

        <button
          type="submit"
          disabled={savingBusiness}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {savingBusiness ? 'Guardando...' : 'Guardar negocio'}
        </button>
      </form>

      <form onSubmit={(e) => void handlePaymentSubmit(e)} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">Mercado Pago</h3>
        <p className="text-xs text-neutral-500">
          Access token de producción de tu cuenta (Tus integraciones → Credenciales, en el panel de
          desarrolladores de Mercado Pago). Se guarda en una tabla aparte que tu catálogo público nunca
          puede leer — solo tú y el checkout del servidor.
        </p>

        <div>
          <label htmlFor="mp-token" className="mb-1 block text-xs font-medium text-neutral-600">
            Access token
          </label>
          <input
            id="mp-token"
            type="password"
            value={mpToken}
            onChange={(e) => setMpToken(e.target.value)}
            placeholder="APP_USR-..."
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
          <input type="checkbox" checked={mpEnabled} onChange={(e) => setMpEnabled(e.target.checked)} />
          Aceptar pagos en línea con Mercado Pago en el catálogo
        </label>

        {paymentError ? <p className="text-xs font-medium text-red-500">{paymentError}</p> : null}
        {paymentSaved ? <p className="text-xs font-medium text-emerald-600">Configuración guardada.</p> : null}

        <button
          type="submit"
          disabled={savingPayment}
          className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {savingPayment ? 'Guardando...' : 'Guardar Mercado Pago'}
        </button>
      </form>
    </div>
  );
}
