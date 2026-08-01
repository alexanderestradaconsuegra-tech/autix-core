import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  // Es una app, no una librería consumida por otros paquetes: no necesita
  // generar declaraciones de tipos (.d.ts).
  dts: false,
  sourcemap: true,
  clean: true,
});
