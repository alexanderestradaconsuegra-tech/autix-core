FROM node:22-alpine AS builder

WORKDIR /app

# Copiar package.json
COPY package*.json ./

# Instalar deps
RUN npm install

# Copiar código fuente
COPY . .

# Compilar TypeScript
RUN npm run build

# Stage final - Runtime
FROM node:22-alpine

WORKDIR /app

# Instalar nginx para servir el frontend
RUN apk add --no-cache nginx curl supervisor

# Copiar package.json solo
COPY package*.json ./

# Instalar deps en modo producción (solo dependencias de runtime)
RUN npm install --production

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
