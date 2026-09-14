export default function AdminPlaceholderPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-neutral-50 px-6 text-center">
      <h1 className="text-lg font-semibold text-neutral-900">Panel de administración</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        Configuración de negocio, gestión de productos y carga CSV — fuera del alcance de esta
        entrega. Ver README de la app para el contrato de datos (`Business`, `Product`,
        `Category` en `src/lib/types.ts`) que este panel debe producir contra el esquema de
        `sql/schema.sql`.
      </p>
    </main>
  );
}
