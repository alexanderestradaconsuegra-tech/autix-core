FROM node:22-alpine AS builder

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

# Copiar package.json (sin lock file corrupto)
COPY package*.json pnpm-workspace.yaml ./
COPY apps ./apps

# Regenerar lockfile limpio
RUN rm -f pnpm-lock.yaml && pnpm install --no-frozen-lockfile

# Compilar
RUN pnpm build

# Stage final - Runtime
FROM node:22-alpine

WORKDIR /app

# Instalar nginx, curl, supervisor
RUN apk add --no-cache nginx curl supervisor

# Instalar pnpm
RUN npm install -g pnpm

# Copiar package.json
COPY package*.json pnpm-workspace.yaml ./
COPY apps ./apps

# Instalar solo deps de producción
RUN pnpm install --prod --no-frozen-lockfile

# Copiar apps compilados del builder
COPY --from=builder /app/apps ./apps

# Copiar frontend HTML
COPY index.html /usr/share/nginx/html/

# Configurar nginx
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/

# Configurar supervisor
COPY supervisord.conf /etc/supervisor/conf.d/

EXPOSE 80 4000 4200

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
