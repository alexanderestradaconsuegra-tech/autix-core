# @autix/tsconfig

Configuración base de `tsconfig.json` compartida por todos los paquetes del
monorepo de Autix Core.

No se publica ni se construye — es un paquete interno que solo exporta un
archivo JSON. Cada paquete lo referencia así:

```jsonc
// packages/<algo>/tsconfig.json
{
  "extends": "@autix/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
  },
  "include": ["src", "*.config.ts"],
}
```

## Decisiones

- `module`/`moduleResolution: NodeNext` — el runtime objetivo es Node.js 22
  con ESM puro, sin interoperabilidad CommonJS que enmascare errores de
  resolución.
- `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride` — el nivel de
  tipado más estricto disponible; en un Core que va a mediar acceso a
  sistemas de negocio, un error de tipos es más caro que la fricción de
  escribirlo bien.
- `incremental: true` — cada paquete cachea su propio `.tsbuildinfo` para que
  `tsc --noEmit` repetido (typecheck y editor) no vuelva a analizar el árbol
  completo cada vez. Con cinco paquetes pequeños no usamos TypeScript Project
  References (`composite` + `tsc -b`) todavía — el build real lo hace `tsup`
  por paquete, no `tsc`, así que el grafo de referencias no aporta hoy. Si el
  número de paquetes crece y el typecheck cruzado se vuelve lento, migrar a
  Project References es un cambio contenido a este paquete y a cada
  `tsconfig.json` que lo extiende.
