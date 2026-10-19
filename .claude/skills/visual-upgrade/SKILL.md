---
name: visual-upgrade
description: Mejora visualmente un sistema o web existente (Next.js, React o HTML) sin tocar lógica, datos ni colores de marca. Usar cuando el usuario pida "mejorar visualmente", "pulir la UI", "que se vea premium", "aplicar el UI kit" o "rediseñar sin dañar nada" en Métrikas, velOS, HOLU, Merka POS, AgendaOS u otro sistema de Autix. Solo cambia la capa de presentación (clases, CSS, componentes visuales), verifica con build, lint y capturas antes/después, y entrega en una rama, nunca en main.
---

# visual-upgrade

Sube el nivel visual de un sistema que ya funciona. La regla que manda: **si algo deja de funcionar o cambia de significado, el cambio sobra.**

## Reglas que no se negocian
1. **Solo presentación.** Se puede tocar: `className`, CSS/Tailwind, tokens, componentes puramente visuales, íconos, espaciado, sombras, animaciones, estados vacíos y de carga.
2. **Prohibido tocar lógica:** llamadas a Supabase/fetch/API, auth, middleware, rutas, server actions, hooks de datos, claves i18n, nombres de campos/`name`/`id`/`data-*` que use el código o los tests, validaciones, props que cambien su contrato, variables de entorno, migraciones.
3. **Colores de marca intactos.** Se reutilizan los tokens existentes (en Métrikas: `brand.blue #0B5CFF`, `brand.dark #071B4D`, `brand.light #F5F7FB`, slate). Variantes (más claro/oscuro/transparencia) derivadas del mismo token. Un color nuevo solo con permiso explícito.
4. **Textos intactos.** No reescribir copy ni traducciones. Si falta un texto (estado vacío), pedirlo o dejar un TODO visible en el informe.
5. **Claro y oscuro.** Si el sistema tiene `dark:`, cada cambio debe verse bien en ambos modos.
6. **Rama aparte.** Trabajar en `visual/<fecha>`; nunca commitear en `main`; nunca desplegar. Entregar un resumen y que el humano decida.
7. **Datos reales: solo lectura.** Si hace falta iniciar sesión para ver pantallas, usar un entorno local con proyecto de pruebas o datos simulados. No usar credenciales de producción ni escribir en la base real.

## Flujo (en este orden)
### 0. Preparar
- `git switch -c visual/$(date +%Y%m%d)`. Anotar el commit base.
- Leer `package.json`, `tailwind.config.*`, `globals.css`, `src/components/ui/*` y el layout. Listar tokens y componentes base.
- Instalar dependencias solo si no están; **no agregar librerías** salvo permiso (el kit se porta con CSS y componentes propios).

### 1. Línea base (antes de tocar nada)
- `npm run build` y `npm run lint` deben pasar. Si ya fallan, anotarlo y no culpar a los cambios propios.
- Capturas de **cada ruta** en: escritorio 1440×900 y móvil 390×844, claro y oscuro. Guardar en el scratchpad (`before/`). Usar Playwright con el Chromium preinstalado (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; no ejecutar `playwright install`).
- Medir desborde horizontal por ruta (`scrollWidth > innerWidth`).

### 2. Mejorar por capas (un commit por capa)
1. **Tokens y base:** fuente con `next/font` (si usa `@import url(...)`, es mejora de rendimiento permitida), escala tipográfica, radios, sombras, foco visible (`focus-visible`), `prefers-reduced-motion`.
2. **Primitivas** (`components/ui`): botón con relieve que se hunde al presionar, tarjetas con borde fino + sombra en capas (y vidrio solo sobre fondos con contenido detrás), inputs, badges, tablas, modales, skeletons y estados vacíos. Mantener las mismas props y variantes; solo cambian las clases.
3. **Layout:** sidebar/header/nav, espaciado, jerarquía, barra de progreso de carga si aplica.
4. **Pantallas:** tarjetas de KPI (número grande con tabular-nums, contador animado al entrar en pantalla), gráficos Recharts con colores de tokens, esquinas redondeadas, tooltip legible, grilla suave; listas y tablas con filas más claras.
5. **Movimiento sutil:** aparición escalonada, inclinación/reflejo solo en puntero fino (`hover:hover and pointer:fine`), nunca en celular. Implementaciones listas en `reference/effects.md`.

### 3. Verificar (obligatorio antes de entregar)
- `npm run build` y `npm run lint` pasan igual o mejor que la línea base.
- `python3 .claude/skills/visual-upgrade/scripts/guard.py <commit_base>` **no debe marcar líneas de lógica**. Si marca algo, revisarlo a mano: o se revierte o se justifica en el informe.
- Capturas `after/` de las mismas rutas y modos; comparar con `before/`; cero desborde horizontal; nada recortado en 360 px.
- Probar los flujos críticos a mano o con script: iniciar sesión, crear/editar un registro, filtrar, exportar PDF (en Métrikas `html2canvas`/`jspdf` dependen del DOM: revisar que el PDF sigue saliendo bien), notificaciones push.
- Contraste de texto AA, foco visible con teclado, `prefers-reduced-motion` respetado.
- Peso: ningún JS nuevo mayor a 10 KB; imágenes en WebP/AVIF con tamaño declarado.

### 4. Entregar
Informe corto en español, sin emojis: qué cambió por capa, capturas antes/después, resultado de build/lint/guard, lo que **no** se tocó a propósito, riesgos y cómo revertir (`git revert <commits>` o borrar la rama). No hacer merge ni deploy.

## Trampas conocidas
- Tailwind no detecta clases armadas con concatenación (`` `bg-${c}-500` ``): usar nombres completos o mapas.
- Efectos con `window`/`matchMedia` van en componentes `'use client'` y dentro de `useEffect`; nada de `Math.random()` ni `Date.now()` en el render (rompe la hidratación).
- No envolver páginas en componentes que cambien el orden del DOM si hay tests, `autoFocus` o lectores de pantalla que dependan de él.
- `backdrop-filter` pesa en celulares de gama baja: limitarlo a 2 o 3 elementos por pantalla.
- Cambiar `z-index` o `overflow` en contenedores puede romper modales, menús y `html2canvas`.
- No tocar `public/sw.js`, manifest ni push: no son visuales.
- Si el kit trae colores o fuentes de otra marca (ej. GOAT: lima y Barlow), **no importarlos**; copiar solo la mecánica (relieve, imán, reflejo, contador).
