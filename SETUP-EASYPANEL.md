# 🚀 Guía de Setup Autix v1.0 en EasyPanel

## Paso 1: Acceder a EasyPanel

```
URL: https://72.61.42.156:3000
Usuario: admin
Contraseña: <tu-password>
```

## Paso 2: Crear Proyecto

1. Click en **"Crear Proyecto"** (Nuevo proyecto)
2. Nombre: `autix-core`
3. Descripción: "Autix Core v1.0 - Runtime de Workflows"
4. Template: **Docker Compose** (vacío)
5. Click **Crear**

## Paso 3: Agregar Servicios

### 3.1 Base de Datos PostgreSQL

**En EasyPanel:**
1. Proyecto: `autix-core`
2. Click **Agregar Servicio**
3. Nombre: `postgres`
4. Imagen: `postgres:16-alpine`
5. Puertos: `5432:5432`
6. Variables de Entorno:
   ```
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=autix2026
   POSTGRES_DB=autix_core
   ```
7. Volúmenes:
   ```
   /var/lib/postgresql/data:/var/lib/postgresql/data
   ```
8. Click **Crear**

### 3.2 Core Server + Campolac Connector

**En EasyPanel:**
1. Click **Agregar Servicio**
2. Nombre: `autix-app`
3. Imagen: `ghcr.io/alexanderestradaconsuegra-tech/autix-core:latest`
   (O build desde GitHub: `alexanderestradaconsuegra-tech/autix-core`)
4. Puertos:
   ```
   80:80    (Frontend + Nginx)
   4000:4000 (Core Server - interno)
   4200:4200 (Campolac - interno)
   ```
5. Variables de Entorno:
   ```
   POSTGRES_DB=autix_core
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=autix2026
   POSTGRES_HOST=autix-core_postgres
   POSTGRES_PORT=5432
   DISABLE_AUTH=true
   CORE_SERVER_URL=http://localhost:4000
   NODE_ENV=production
   ```
6. Dependencias: `postgres`
7. Click **Crear**

## Paso 4: Inicializar Base de Datos

1. En EasyPanel → Proyecto `autix-core` → Servicio `postgres` → **Consola**
2. Ejecutar SQL:

```sql
-- Crear usuario
CREATE USER autix_user WITH PASSWORD 'autix2026';

-- Conectar a DB
\c autix_core

-- Copiar y pegar el contenido de autix-schema.sql
-- Luego copiar y pegar el contenido de campolac-schema.sql

-- Dar permisos
GRANT ALL ON ALL TABLES IN SCHEMA public TO autix_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO autix_user;
```

**Alternativa - Ejecutar scripts:**
```bash
# Desde la consola del servicio postgres
psql -U postgres -d autix_core < autix-schema.sql
psql -U postgres -d autix_core < campolac-schema.sql
```

## Paso 5: Configurar Dominio

1. En Hostinger → DNS → Registros A
2. Agregar/modificar:
   ```
   autix  A  72.61.42.156
   ```

3. En EasyPanel → Servicio `autix-app`
   - Dominio: `autix.tu-dominio.com`
   - SSL: Habilitar (Let's Encrypt automático)

## Paso 6: Verificar Deployment

1. **Health Check:**
   ```bash
   curl https://autix.tu-dominio.com/health
   ```

2. **Acceder a Studio:**
   ```
   https://autix.tu-dominio.com
   ```

3. **Test de Workflow:**
   - Crear agente
   - Crear workflow
   - Ejecutar
   - Ver resultados en tiempo real

## Paso 7: Integración con n8n (Opcional)

Si quieres agregar automaciones adicionales:

1. En n8n (https://n8n-n8n.fa2cjf.easypanel.host/)
2. Crear credencial Postgres:
   - Host: `autix-core_postgres`
   - Port: `5432`
   - User: `postgres`
   - Password: `autix2026`
   - Database: `autix_core`

3. Crear workflow para webhook `/autix-agent`:
   ```
   Webhook → Switch (action) → Postgres Query → Respond
   ```

## Monitoreo

### Logs en Tiempo Real
```bash
# En EasyPanel → Servicio → Logs
tail -f logs
```

### Metricas
- CPU/RAM: Panel dashboard
- Errores: Logs del servicio
- Queries lentas: PostgreSQL logs

## Troubleshooting

### "Connection refused" a Database
```bash
# Verificar que postgres está corriendo
docker-compose ps

# En EasyPanel consola
ping autix-core_postgres
```

### "Port already in use"
```bash
# Cambiar puerto en EasyPanel:
80:8080  (en lugar de 80:80)
```

### "SSL certificate error"
```bash
# Esperar 5-10 minutos a que Let's Encrypt emita el certificado
# Luego limpiar cache del navegador (Ctrl+Shift+Del)
```

### "Workflows no se cargan"
```bash
# Verificar conectividad Core Server
curl http://localhost:4000/health

# En logs buscar errores de DB
grep "connection refused" logs
```

## Backup & Restore

### Backup de DB
```bash
# En EasyPanel → postgres → Consola
pg_dump -U postgres autix_core > backup.sql

# Descargar archivo
```

### Restore de DB
```bash
# Subir archivo a EasyPanel
# En consola postgres:
psql -U postgres -d autix_core < backup.sql
```

## Escalado (Producción)

Para múltiples instancias:

1. **Load Balancer:** Nginx reverse proxy
2. **Replicas de Core:** 2-3 instancias con shared DB
3. **Cache:** Redis (para sessions)
4. **Monitoring:** Prometheus + Grafana

Contactar a `alexander@autix.pro` para setup production.

---

## 📞 Soporte

- **Documentación:** https://github.com/alexanderestradaconsuegra-tech/autix-core
- **Issues:** https://github.com/alexanderestradaconsuegra-tech/autix-core/issues
- **Email:** alexander@autix.pro
