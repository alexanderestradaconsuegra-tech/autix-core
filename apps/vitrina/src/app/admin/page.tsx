'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AdminAuthGate } from '@/components/admin/AdminAuthGate';
import { BusinessSettingsForm } from '@/components/admin/BusinessSettingsForm';
import { CategoryManager } from '@/components/admin/CategoryManager';
import { HeroSettingsForm, type HeroPatch } from '@/components/admin/HeroSettingsForm';
import { MessagesTab } from '@/components/admin/MessagesTab';
import { OrdersTab } from '@/components/admin/OrdersTab';
import { PaywallScreen } from '@/components/admin/PaywallScreen';
import { ProductForm, type ProductInput } from '@/components/admin/ProductForm';
import { ProductList } from '@/components/admin/ProductList';
import { TrialBanner } from '@/components/admin/TrialBanner';
import {
  createBusiness,
  deleteProduct,
  getOwnedBusiness,
  getPaymentSettings,
  listAllProducts,
  listCategories,
  savePaymentSettings,
  updateBusiness,
  upsertProduct,
  uploadProductImage,
  type OwnedBusiness,
  type PaymentSettings,
} from '@/lib/supabase/admin';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isLicenseActive } from '@/lib/licensing';
import type { Category, Product } from '@/lib/types';

const CURRENCIES = ['USD', 'EUR', 'CLP', 'MXN', 'COP', 'PEN', 'ARS', 'BRL'];

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `negocio-${Date.now()}`
  );
}

export default function AdminPage() {
  return <AdminAuthGate>{(session) => <AdminDashboard session={session} />}</AdminAuthGate>;
}

function AdminDashboard({ session }: { session: Session }) {
  const [business, setBusiness] = useState<OwnedBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'negocio' | 'productos' | 'pedidos' | 'mensajes'>('negocio');

  useEffect(() => {
    void getOwnedBusiness(session.user.id).then((owned) => {
      setBusiness(owned);
      setLoading(false);
    });
  }, [session.user.id]);

  async function handleSignOut() {
    await getSupabaseBrowserClient().auth.signOut();
  }

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-neutral-400">Cargando...</div>;
  }

  if (!business) {
    return (
      <CreateBusinessForm
        ownerId={session.user.id}
        onCreated={setBusiness}
        onSignOut={() => void handleSignOut()}
      />
    );
  }

  if (!isLicenseActive(business)) {
    return <PaywallScreen business={business} onSignOut={() => void handleSignOut()} />;
  }

  return (
    <main className="min-h-dvh bg-neutral-50 pb-16">
      <header className="border-b border-neutral-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-neutral-900">{business.name}</p>
            <p className="text-xs text-neutral-400">/c/{business.slug}</p>
          </div>
          <button type="button" onClick={() => void handleSignOut()} className="text-xs font-medium text-neutral-500">
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-3">
        {business.licenseStatus === 'trial' ? <TrialBanner business={business} /> : null}
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {(
            [
              ['negocio', 'Negocio'],
              ['productos', 'Productos'],
              ['pedidos', 'Pedidos'],
              ['mensajes', 'Mensajes'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium ${
                tab === value ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'negocio' ? <BusinessTab business={business} onBusinessUpdated={setBusiness} /> : null}
        {tab === 'productos' ? <ProductsTab business={business} /> : null}
        {tab === 'pedidos' ? <OrdersTab business={business} /> : null}
        {tab === 'mensajes' ? <MessagesTab business={business} /> : null}
      </div>
    </main>
  );
}

function CreateBusinessForm({
  ownerId,
  onCreated,
  onSignOut,
}: {
  ownerId: string;
  onCreated: (business: OwnedBusiness) => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const business = await createBusiness(ownerId, {
        slug: slugify(name),
        name: name.trim(),
        phone: phone.trim(),
        currency,
      });
      onCreated(business);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos crear tu catálogo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-6">
      <form onSubmit={(e) => void handleSubmit(e)} className="w-full max-w-sm space-y-3 rounded-2xl border border-neutral-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-neutral-900">Configura tu catálogo</h1>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del negocio"
          required
          className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="WhatsApp: 573001234567"
          required
          className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {error ? <p className="text-xs font-medium text-red-500">{error}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Creando...' : 'Crear catálogo'}
        </button>
        <button type="button" onClick={onSignOut} className="w-full text-center text-xs font-medium text-neutral-500">
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}

function BusinessTab({
  business,
  onBusinessUpdated,
}: {
  business: OwnedBusiness;
  onBusinessUpdated: (business: OwnedBusiness) => void;
}) {
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
    mercadopagoAccessToken: null,
    mercadopagoEnabled: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getPaymentSettings(business.id).then((settings) => {
      setPaymentSettings(settings);
      setLoading(false);
    });
  }, [business.id]);

  if (loading) return <p className="py-8 text-center text-sm text-neutral-400">Cargando...</p>;

  return (
    <div className="space-y-6">
      <BusinessSettingsForm
        business={business}
        paymentSettings={paymentSettings}
        onUploadLogo={(file) => uploadProductImage(business.id, file)}
        onSaveBusiness={async (patch) => {
          await updateBusiness(business.id, patch);
          onBusinessUpdated({ ...business, ...patch });
        }}
        onSavePayment={async (settings) => {
          await savePaymentSettings(business.id, settings);
          setPaymentSettings(settings);
          onBusinessUpdated({ ...business, acceptsMercadopago: settings.mercadopagoEnabled });
        }}
      />
      <HeroSettingsForm
        business={business}
        onUploadHeroImage={(file) => uploadProductImage(business.id, file)}
        onSaveHero={async (patch: HeroPatch) => {
          await updateBusiness(business.id, patch);
          onBusinessUpdated({ ...business, ...patch });
        }}
      />
    </div>
  );
}

function ProductsTab({ business }: { business: OwnedBusiness }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const [productRows, categoryRows] = await Promise.all([listAllProducts(business.id), listCategories(business.id)]);
    setProducts(productRows);
    setCategories(categoryRows);
  }

  useEffect(() => {
    void Promise.all([listAllProducts(business.id), listCategories(business.id)]).then(
      ([productRows, categoryRows]) => {
        setProducts(productRows);
        setCategories(categoryRows);
        setLoading(false);
      },
    );
  }, [business.id]);

  if (loading) return <p className="py-8 text-center text-sm text-neutral-400">Cargando...</p>;

  if (editing) {
    return (
      <ProductForm
        categories={categories}
        initialProduct={editing === 'new' ? undefined : editing}
        onUploadImage={(file) => uploadProductImage(business.id, file)}
        onSubmit={async (product: ProductInput) => {
          await upsertProduct(business.id, product);
          setEditing(null);
          await reload();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <CategoryManager businessId={business.id} categories={categories} onChanged={reload} />
      <button
        type="button"
        onClick={() => setEditing('new')}
        className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white"
      >
        + Agregar producto
      </button>
      <ProductList
        products={products}
        currency={business.currency}
        onEdit={setEditing}
        onDelete={(product) => {
          if (!confirm(`¿Eliminar "${product.name}"?`)) return;
          void deleteProduct(product.id).then(() => reload());
        }}
      />
    </div>
  );
}
