# Efectos listos para Next.js 14 + Tailwind (sin dependencias nuevas)

Origen: UI Kit de GOAT (relieve, imán, reflejo, inclinación, contador, progreso), portado a React y a los tokens del sistema. Usar los colores del proyecto, no los del kit.

## CSS base (`globals.css`)
```css
@layer components {
  /* Botón con relieve que se hunde al presionar. Usa el color del texto actual para el halo. */
  .btn-press {
    box-shadow: 0 8px 0 -4px rgb(0 0 0 / .28), 0 16px 28px -14px rgb(0 0 0 / .55);
    transition: transform .25s cubic-bezier(.16,1,.3,1), box-shadow .25s cubic-bezier(.16,1,.3,1);
  }
  .btn-press:hover { transform: translateY(-2px); }
  .btn-press:active { transform: translateY(3px); box-shadow: 0 4px 0 -3px rgb(0 0 0 / .28), 0 8px 14px -10px rgb(0 0 0 / .5); }
  .card-spot { position: relative; isolation: isolate; }
  .card-spot::after {
    content: ""; position: absolute; inset: 0; z-index: 1; border-radius: inherit; pointer-events: none; opacity: 0;
    transition: opacity .35s; background: radial-gradient(320px circle at var(--mx,50%) var(--my,0%), rgb(255 255 255 / .35), transparent 60%); mix-blend-mode: soft-light;
  }
  @media (hover: hover) and (pointer: fine) { .card-spot:hover::after { opacity: 1; } }
}
@media (prefers-reduced-motion: reduce) { .btn-press, .card-spot::after { transition: none; } }
```

## `Reveal.tsx` (aparece al entrar en pantalla)
```tsx
'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setOn(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${on ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'} ${className}`}>
      {children}
    </div>
  )
}
```
Cuidado: envolver contenido en `Reveal` no cambia su lógica, pero no usarlo sobre elementos con `autoFocus` ni sobre contenido que `html2canvas` capture justo al cargar.

## `CountUp.tsx` (contador de KPI)
```tsx
'use client'
import { useEffect, useRef, useState } from 'react'

export function CountUp({ to, format = (n: number) => String(Math.round(n)) }: { to: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [v, setV] = useState(to)            // arranca en el valor final: sin parpadeo ni problema de hidratación
  useEffect(() => {
    const el = ref.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const step = (t: number) => { const p = Math.min((t - t0) / 1100, 1); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step) }
      setV(0); requestAnimationFrame(step)
    }, { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [to])
  return <span ref={ref} className="tabular-nums">{format(v)}</span>
}
```

## `useSpotlightTilt` (solo puntero fino)
```tsx
'use client'
import { useEffect, type RefObject } from 'react'

export function useSpotlightTilt(ref: RefObject<HTMLElement>, max = 4) {
  useEffect(() => {
    const el = ref.current
    if (!el || !matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5
      el.style.setProperty('--mx', `${e.clientX - r.left}px`); el.style.setProperty('--my', `${e.clientY - r.top}px`)
      el.style.transform = `perspective(900px) rotateX(${-py * max}deg) rotateY(${px * max}deg) translateY(-3px)`
    }
    const leave = () => { el.style.transform = '' }
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave)
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave) }
  }, [ref, max])
}
```

## Barra de progreso de carga/scroll
Una `div` fija de 3 px con `bg-brand-blue` y `transform: scaleX(var(--p))`, actualizada con un `scroll` listener pasivo (o con `usePathname` para transiciones de ruta). Sin librerías.

## Recharts
- Colores desde los tokens (`#0B5CFF` y sus variantes), no paletas por defecto.
- `radius={[8,8,0,0]}` en barras, `strokeWidth={2.5}` en líneas, `CartesianGrid stroke` con alpha baja, `Tooltip` con tarjeta propia (fondo del tema, sombra en capas).
- Respetar `isAnimationActive` en reduced-motion.
