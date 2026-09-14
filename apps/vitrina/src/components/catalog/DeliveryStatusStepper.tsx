import { CheckCircle2, ChefHat, PackageCheck, Truck } from 'lucide-react';
import type { DeliveryStatus } from '@/lib/supabase/orders';

const STEPS: { key: DeliveryStatus; label: string; icon: typeof PackageCheck }[] = [
  { key: 'received', label: 'Recibido', icon: PackageCheck },
  { key: 'preparing', label: 'Preparando', icon: ChefHat },
  { key: 'out_for_delivery', label: 'En camino', icon: Truck },
  { key: 'delivered', label: 'Entregado', icon: CheckCircle2 },
];

export function DeliveryStatusStepper({ status }: { status: DeliveryStatus }) {
  const currentIndex = STEPS.findIndex((step) => step.key === status);

  return (
    <div className="flex items-start justify-between">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const isDone = index <= currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <div key={step.key} className="flex flex-1 flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              {index > 0 ? (
                <div className={`h-0.5 flex-1 ${index <= currentIndex ? 'bg-emerald-500' : 'bg-neutral-200'}`} />
              ) : (
                <div className="flex-1" />
              )}
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  isDone ? 'bg-emerald-500 text-white' : 'bg-neutral-100 text-neutral-300'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              {index < STEPS.length - 1 ? (
                <div className={`h-0.5 flex-1 ${index < currentIndex ? 'bg-emerald-500' : 'bg-neutral-200'}`} />
              ) : (
                <div className="flex-1" />
              )}
            </div>
            <span className={`text-[11px] font-medium ${isCurrent ? 'text-emerald-700' : 'text-neutral-400'}`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
