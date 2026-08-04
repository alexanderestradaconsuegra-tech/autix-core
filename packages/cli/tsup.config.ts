import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  clean: true,
  // src/index.ts empieza con `#!/usr/bin/env node`; tsup detecta el shebang
  // del entry point, lo conserva en el bundle final y marca el archivo
  // como ejecutable (chmod +x) automáticamente.
});
