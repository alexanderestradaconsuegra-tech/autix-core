FROM node:22-alpine

WORKDIR /app

# Instalar nginx, curl, supervisor
RUN apk add --no-cache nginx curl supervisor

# Copiar package.json y módulos compilados
COPY package*.json ./
COPY apps ./apps

# Copiar frontend HTML
COPY index.html /usr/share/nginx/html/

# Configurar nginx
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/

# Configurar supervisor
COPY supervisord.conf /etc/supervisor/conf.d/

EXPOSE 80 4000 4200

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
