import Link from 'next/link';
import {
  Check,
  CircleHelp,
  MessageCircle,
  Package,
  Share2,
  ShoppingBag,
  Star,
  Truck,
  Wallet,
} from 'lucide-react';

const STEPS = [
  {
    title: 'Agrega tus productos',
    description: 'Nombre, foto, precio y categoría desde tu celular. Sin hojas de cálculo.',
  },
  {
    title: 'Comparte tu link',
    description: 'vitrina.autix.pro/c/tu-negocio — lo pegas en tu bio de Instagram o en tu estado de WhatsApp.',
  },
  {
    title: 'Recibe el pedido',
    description: 'El cliente arma su carrito y te llega el detalle armado directo a tu WhatsApp.',
  },
];

const FEATURES = [
  {
    icon: ShoppingBag,
    title: 'Catálogo con carrito',
    description: 'Buscador, categorías y carrito flotante — se siente como una tienda de verdad, no un PDF.',
  },
  {
    icon: MessageCircle,
    title: 'Pedido directo a WhatsApp',
    description: 'El mensaje llega listo: productos, cantidades y total. Tú solo confirmas.',
  },
  {
    icon: Wallet,
    title: 'Cobro con Mercado Pago',
    description: 'Actívalo con tu propio access token y tus clientes pagan en línea sin salir del catálogo.',
  },
  {
    icon: Truck,
    title: 'Seguimiento de entrega',
    description: 'Marca Recibido → Preparando → En camino → Entregado y tu cliente lo ve en tiempo real.',
  },
  {
    icon: Star,
    title: 'Reseñas de Google',
    description: 'Después de cada pedido, invita a tus clientes a dejar una reseña con un botón.',
  },
  {
    icon: CircleHelp,
    title: 'Mensaje de ayuda',
    description: 'Un botón para que te escriban dudas sin agregar un producto al carrito primero.',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-neutral-50">
      {/* Hero */}
      <section className="border-b border-neutral-200 bg-white px-4 pb-14 pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-bold text-white">
            V
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">Vitrina</h1>
          <p className="mx-auto mt-3 max-w-md text-balance text-base text-neutral-600">
            Convierte la lista de productos de tu negocio en un catálogo web con carrito que arma el
            pedido y lo envía directo a tu WhatsApp.
          </p>
          <div className="mt-7 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/admin"
              className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white active:bg-emerald-700 sm:w-auto"
            >
              Crear mi catálogo gratis
            </Link>
            <a
              href="#como-funciona"
              className="w-full rounded-xl border border-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-700 sm:w-auto"
            >
              Ver cómo funciona
            </a>
          </div>
          <p className="mt-3 text-xs text-neutral-400">
            14 días gratis, sin tarjeta. Después, $7 USD de por vida — no es suscripción.
          </p>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="px-4 py-14">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-xl font-semibold text-neutral-900">Cómo funciona</h2>
          <p className="mx-auto mt-1 max-w-sm text-center text-sm text-neutral-500">
            Tres pasos, sin instalar nada ni pedirle a tus clientes que descarguen una app.
          </p>

          <ol className="mt-8 space-y-5">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900">{step.title}</h3>
                  <p className="mt-0.5 text-sm text-neutral-500">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-neutral-200 bg-white px-4 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-xl font-semibold text-neutral-900">Qué incluye</h2>
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-neutral-200 p-4">
                <feature.icon className="h-5 w-5 text-emerald-600" />
                <h3 className="mt-2.5 text-sm font-semibold text-neutral-900">{feature.title}</h3>
                <p className="mt-1 text-sm text-neutral-500">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Precio */}
      <section className="px-4 py-14">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-xl font-semibold text-neutral-900">Precio</h2>
          <p className="mx-auto mt-1 max-w-sm text-center text-sm text-neutral-500">
            Un pago, no una mensualidad. Pruébalo gratis dos semanas.
          </p>

          <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Licencia de por vida</p>
            <p className="mt-2 text-4xl font-bold text-neutral-900">
              $7 <span className="text-base font-medium text-neutral-400">USD</span>
            </p>
            <p className="mt-1 text-sm text-neutral-500">Pago único. Sin mensualidad, sin límite de tiempo.</p>

            <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left">
              {[
                'Catálogo, carrito y pedido por WhatsApp',
                'Seguimiento de entrega para tus clientes',
                'Reseñas de Google y mensaje de ayuda',
                'Productos, fotos y categorías ilimitadas',
                'Cobro con Mercado Pago (tú usas tu propia cuenta)',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-neutral-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>

            <Link
              href="/admin"
              className="mt-6 inline-block w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white active:bg-emerald-700 sm:w-auto"
            >
              Empezar prueba de 14 días
            </Link>
            <p className="mt-2 text-xs text-neutral-400">No pides tarjeta hasta que decidas quedarte.</p>
          </div>
        </div>
      </section>

      {/* Cómo usar el panel */}
      <section className="px-4 py-14">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-xl font-semibold text-neutral-900">Cómo usar tu panel</h2>
          <p className="mx-auto mt-1 max-w-sm text-center text-sm text-neutral-500">
            Todo se administra desde <code className="rounded bg-neutral-100 px-1 py-0.5">/admin</code>.
          </p>

          <div className="mt-8 space-y-3">
            <GuideItem
              icon={Package}
              title="1. Crea tu cuenta y tu negocio"
              description="Entra a /admin, regístrate con tu correo y completa nombre, WhatsApp y moneda. Tu catálogo queda en /c/tu-negocio."
            />
            <GuideItem
              icon={ShoppingBag}
              title="2. Agrega productos"
              description="Pestaña Productos → Agregar producto. Sube la foto, pon el precio y guarda. Aparece al instante en tu catálogo."
            />
            <GuideItem
              icon={Truck}
              title="3. Gestiona tus pedidos"
              description="Pestaña Pedidos: cada venta llega ahí. Marca el avance (Preparando, En camino, Entregado) y tu cliente lo ve solo."
            />
            <GuideItem
              icon={Share2}
              title="4. Comparte tu link"
              description="Copia la URL de tu catálogo y pégala en tu bio de Instagram, tu estado de WhatsApp o donde vendas."
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 px-4 py-8 text-center">
        <p className="text-xs text-neutral-400">Vitrina · un producto de Autix</p>
      </footer>
    </main>
  );
}

function GuideItem({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Package;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <Icon className="h-5 w-5 shrink-0 text-neutral-400" />
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        <p className="mt-0.5 text-sm text-neutral-500">{description}</p>
      </div>
    </div>
  );
}
