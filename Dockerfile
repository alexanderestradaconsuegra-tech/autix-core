FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm fresh (not from corrupted lockfile)
RUN npm install -g pnpm@10.33.0

# Copy everything
COPY . .

# Remove corrupted lockfile and install fresh
RUN rm -f pnpm-lock.yaml

# Install all dependencies
RUN pnpm install --no-frozen-lockfile

# Compile TypeScript
RUN pnpm -r run build

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

# Install system dependencies
RUN apk add --no-cache nginx curl supervisor

# Copy compiled code and node_modules from builder
COPY --from=builder /app/apps/core-server/dist ./apps/core-server/dist
COPY --from=builder /app/apps/core-server/node_modules ./apps/core-server/node_modules
COPY --from=builder /app/apps/campolac-connector/dist ./apps/campolac-connector/dist
COPY --from=builder /app/apps/campolac-connector/node_modules ./apps/campolac-connector/node_modules
COPY --from=builder /app/node_modules ./node_modules

# Copy configuration
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80 4000 4200

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
