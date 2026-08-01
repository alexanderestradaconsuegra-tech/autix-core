# Autix Core v1.0 - Runtime de Workflows Inteligentes

**Sistema production-ready de orquestación de workflows con resolución de variables y ejecución secuencial.**

## 📋 Contenido

- **Core Server**: Motor de ejecución (ExecutionEngine)
- **Campolac Connector**: Integración con base de datos Campolac
- **Studio Frontend**: Interfaz single-file HTML para gestionar workflows
- **PostgreSQL Schema**: Tablas de agentes, workflows y ejecuciones

## 🚀 Deploy en EasyPanel

### 1. Crear Servicio en EasyPanel

```bash
# En EasyPanel → Crear nuevo servicio
Nombre: autix-core
Imagen: docker pull ghcr.io/alexest/autix-core:latest
Puertos: 80 (frontend), 4000 (core), 4200 (connector)
Variables de Entorno:
  POSTGRES_DB=autix_core
  POSTGRES_USER=postgres
  POSTGRES_PASSWORD=<tu-password>
  POSTGRES_HOST=<host-postgres-interno>
  DISABLE_AUTH=true
  CORE_SERVER_URL=http://localhost:4000
```

### 2. Crear Base de Datos

Desde la consola PostgreSQL en EasyPanel:

```bash
# Crear DB
CREATE DATABASE autix_core OWNER postgres;

# Conectar a la DB
\c autix_core

# Ejecutar schema
\i autix-schema.sql
\i campolac-schema.sql
```

### 3. Configurar Dominio

En EasyPanel:
```
Dominio: https://autix.tu-dominio.com
Certificado: Let's Encrypt (automático)
```

### 4. Deploy Automático

Una vez en EasyPanel, el servicio se despliega automáticamente con:
```bash
docker-compose up -d
```

## 🔌 API Endpoints

### Agents
```bash
POST   /v1/agents              # Crear agente
GET    /v1/agents              # Listar agentes
GET    /v1/agents/:id          # Obtener agente
PUT    /v1/agents/:id          # Actualizar agente
DELETE /v1/agents/:id          # Eliminar agente
```

### Workflows
```bash
POST   /v1/workflows           # Crear workflow
GET    /v1/workflows           # Listar workflows
GET    /v1/workflows/:id       # Obtener workflow
PUT    /v1/workflows/:id       # Actualizar workflow
DELETE /v1/workflows/:id       # Eliminar workflow
POST   /v1/workflows/:id/execute  # Ejecutar workflow
```

### Executions
```bash
GET    /v1/workflows/:wid/executions      # Listar ejecuciones
GET    /v1/workflows/:wid/executions/:id  # Obtener ejecución
```

## 📝 Ejemplo: Crear y Ejecutar Workflow

### 1. Crear Agente
```bash
curl -X POST http://localhost:4000/v1/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "Mi Agente",
    "model": "gpt-4",
    "capabilities": ["campolac.clientes.buscar", "campolac.productos.consultar"]
  }'
```

### 2. Crear Workflow con 3 Pasos
```bash
curl -X POST http://localhost:4000/v1/workflows \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "Pipeline Campolac",
    "steps": [
      {
        "id": "paso-1",
        "displayName": "Buscar Cliente",
        "toolId": "campolac.clientes.buscar",
        "connectorId": "campolac-connector",
        "input": {"criterio": "Minimarket"},
        "dependsOn": []
      },
      {
        "id": "paso-2",
        "displayName": "Consultar Productos",
        "toolId": "campolac.productos.consultar",
        "connectorId": "campolac-connector",
        "input": {"producto": "Queso"},
        "dependsOn": []
      },
      {
        "id": "paso-3",
        "displayName": "Crear Orden",
        "toolId": "campolac.pedidos.crear",
        "connectorId": "campolac-connector",
        "input": {
          "clienteId": "{{ steps.paso-1.output.clientes[0].id }}",
          "items": [
            {
              "productoId": 1,
              "cantidad": 10,
              "precioUnitario": "{{ steps.paso-2.output.productos[0].precioMayor }}"
            }
          ]
        },
        "dependsOn": ["paso-1", "paso-2"]
      }
    ]
  }'
```

### 3. Ejecutar Workflow
```bash
curl -X POST http://localhost:4000/v1/workflows/<workflow-id>/execute \
  -H "Authorization: Bearer <token>"
```

### 4. Consultar Ejecución
```bash
curl http://localhost:4000/v1/workflows/<workflow-id>/executions/<execution-id> \
  -H "Authorization: Bearer <token>"
```

## 🛠️ Características Principales

### ✅ Sequential Execution (Fase A v1.0)
- Steps ejecutan secuencialmente en orden de dependencias
- Se detiene en el primer error
- Cada step puede depender de múltiples steps anteriores

### ✅ Variable Resolution
Soporta templates: `{{ steps.step-id.output.field }}`
- Nested paths: `steps.paso-1.output.clientes[0].id`
- Array indexing: `items[0].precio`
- Dot notation: `data.cliente.nombre`

### ✅ Multi-tenancy
Todos los datos filtrados por `tenant_id` de JWT token
- Aislamiento completo entre tenants
- Auditoría de todas las operaciones

### ✅ Real Connector Integration
Ejecución de tools contra conectores reales (HTTP)
- Healthcheck automático
- Timeout y reintentos configurables
- Respuestas estruturadas

## 🔐 Seguridad

### Autenticación
En modo test: `DISABLE_AUTH=true` (JWT decodificado sin verificar)
En producción: OAuth2 con JWKS verification

### Headers requeridos
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

### Multi-tenancy
```javascript
// Token JWT incluye tenant_id
{
  "sub": "usuario@empresa.com",
  "tenant_id": "empresa-001",
  "iat": 1234567890,
  "exp": 1234571490
}
```

## 📊 Monitoreo

### Logs
```bash
# En EasyPanel → Servicio → Logs
tail -f /var/log/core-server.log
tail -f /var/log/connector.log
```

### Health Checks
```bash
# Core Server
curl http://localhost:4000/health

# Campolac Connector
curl http://localhost:4200/healthz

# Sistema general
curl https://autix.tu-dominio.com/health
```

## 🐛 Troubleshooting

### "Database connection refused"
```bash
# Verificar que PostgreSQL está corriendo
docker-compose ps

# Revisar credenciales de conexión
POSTGRES_HOST=<internal-hostname>
POSTGRES_USER=postgres
POSTGRES_DB=autix_core
```

### "Tool not found en Registry"
Campolac Connector debe auto-registrarse. Verificar:
```bash
# En logs del Core Server
curl http://localhost:4000/v1/capabilities
```

### "Invalid variable resolution"
Patterns soportados:
- ✅ `{{ steps.step-1.output.campo }}`
- ✅ `{{ steps.step-1.output.array[0].field }}`
- ❌ `{{ steps.step-1.output['array']['field'] }}` (no soportado)

## 📚 Documentación Adicional

- [Architecture](./ARCHITECTURE.md) - Diseño del sistema
- [Validation Report](./VALIDATION_REPORT.md) - Reporte de testing
- [API Spec](./API_SPEC.md) - Especificación OpenAPI

## 🤝 Soporte

Para issues o preguntas:
- GitHub: https://github.com/alexanderestradaconsuegra-tech/autix-core
- Email: alexander@autix.pro

---

**Autix v1.0** - Runtime de Workflows Empresariales
Built with ❤️ por Alexander Estrada
