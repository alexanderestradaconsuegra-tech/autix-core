import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import globals from 'globals';

const ignores = [
  '**/dist/**',
  '**/.next/**',
  '**/node_modules/**',
  '**/coverage/**',
  '**/*.tsbuildinfo',
  'pnpm-lock.yaml',
  // Artefactos estáticos del ERP Campolac legacy que viven en la raíz del
  // repo (campolac-os.html, sw.js, etc.) — no pertenecen a ningún workspace
  // de este monorepo y no están escritos contra este toolchain.
  'sw.js',
];

/**
 * `eslint-config-next/core-web-vitals` trae su propio parser Babel-based y
 * su propio bloque `@typescript-eslint` (no project-aware) — ninguno de los
 * dos se usa acá: las apps Next.js del monorepo siguen el mismo
 * `tseslint.configs.recommendedTypeChecked` + `projectService` que el resto
 * (ver el bloque de tipos `.ts`/`.tsx` de arriba), así que solo se reutilizan
 * sus plugins y reglas (react, react-hooks, jsx-a11y, `@next/next`) — la
 * curación oficial de Next.js para JSX/a11y, sin duplicar ni pelear por el
 * parser de TypeScript.
 */
const nextReactRules = nextCoreWebVitals[0];
const nextApps = ['apps/vitrina'];

export default tseslint.config(
  { ignores },
  js.configs.recommended,
  {
    files: ['**/*.ts', ...nextApps.map((app) => `${app}/**/*.tsx`)],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  ...nextApps.map((app) => ({
    files: [`${app}/**/*.{ts,tsx}`],
    plugins: nextReactRules.plugins,
    settings: {
      ...nextReactRules.settings,
      // Evita que `@next/next/no-html-link-for-pages` busque un Pages
      // Router inexistente en la raíz del monorepo — estas apps son
      // exclusivamente App Router.
      next: { rootDir: app },
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: nextReactRules.rules,
  })),
  eslintConfigPrettier,
);
