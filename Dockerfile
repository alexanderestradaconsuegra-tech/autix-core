FROM node:22-alpine AS builder

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

# Copiar package.json y lock
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Instalar deps
RUN pnpm install

# Copiar código fuente
COPY . .

# Compilar TypeScript
RUN pnpm build

# Stage final - Runtime
FROM node:22-alpine

WORKDIR /app

# Instalar nginx para servir el frontend
RUN apk add --no-cache nginx curl supervisor

# Copiar pnpm
RUN npm install -g pnpm

# Copiar package.json solo
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Instalar deps en modo producción
RUN pnpm install --prod

# Copiar build del stage anterior
COPY --from=builder /app/apps ./apps

# Copiar frontend HTML
COPY index.html /usr/share/nginx/html/

# Configurar nginx
RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/

# Configurar supervisor para múltiples procesos
COPY supervisord.conf /etc/supervisor/conf.d/

EXPOSE 80 4000 4200

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
