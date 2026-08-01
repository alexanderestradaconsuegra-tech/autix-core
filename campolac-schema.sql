-- ============================================================
-- CAMPOLAC OS — Schema PostgreSQL
-- Distribuidora mayorista de quesos artesanales
-- Negocio único (sin multi-tenancy, no es SaaS de reventa)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- CLIENTES (minimarkets, restaurantes, ferias) ----------
CREATE TABLE clientes (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(150) NOT NULL,
  razon_social    VARCHAR(150),
  rut             VARCHAR(20),
  telefono        VARCHAR(20) UNIQUE NOT NULL,
  direccion       TEXT,
  tipo            VARCHAR(30) DEFAULT 'minimarket', -- minimarket, restaurant, feria, otro
  limite_credito  NUMERIC(12,0) DEFAULT 0,
  saldo_deuda     NUMERIC(12,0) DEFAULT 0,
  activo          BOOLEAN DEFAULT true,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_clientes_tel ON clientes(telefono);

-- ---------- PRODUCTOS (quesos y derivados) ----------
CREATE TABLE productos (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(150) NOT NULL,
  categoria       VARCHAR(50) DEFAULT 'queso fresco', -- fresco, madurado, mantequilla, yogurt, otro
  unidad          VARCHAR(20) DEFAULT 'kg',            -- kg, unidad, caja
  precio_mayor    NUMERIC(10,0) NOT NULL,
  precio_costo    NUMERIC(10,0) DEFAULT 0,
  stock_kg        NUMERIC(10,2) DEFAULT 0,
  stock_minimo    NUMERIC(10,2) DEFAULT 5,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- PEDIDOS (levantados por Hermes vía WhatsApp o dashboard) ----------
CREATE TABLE pedidos (
  id              SERIAL PRIMARY KEY,
  cliente_id      INT REFERENCES clientes(id),
  cliente_nombre  VARCHAR(150),
  cliente_tel     VARCHAR(20),
  estado          VARCHAR(20) DEFAULT 'pendiente', -- pendiente, confirmado, preparando, entregado, cancelado
  origen          VARCHAR(20) DEFAULT 'whatsapp',  -- whatsapp, manual, dashboard
  total           NUMERIC(12,0) DEFAULT 0,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);

CREATE TABLE pedido_items (
  id                SERIAL PRIMARY KEY,
  pedido_id         INT REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id       INT REFERENCES productos(id),
  producto_nombre   VARCHAR(150),
  cantidad          NUMERIC(10,2) NOT NULL,
  precio_unitario   NUMERIC(10,0) NOT NULL,
  subtotal          NUMERIC(12,0) NOT NULL
);

-- ---------- VENTAS (pedido facturado) ----------
CREATE TABLE ventas (
  id              SERIAL PRIMARY KEY,
  pedido_id       INT REFERENCES pedidos(id),
  cliente_id      INT REFERENCES clientes(id),
  cliente_nombre  VARCHAR(150),
  total           NUMERIC(12,0) NOT NULL,
  metodo_pago     VARCHAR(20) DEFAULT 'efectivo', -- efectivo, transferencia, credito
  estado_pago     VARCHAR(20) DEFAULT 'pagado',   -- pagado, pendiente, parcial
  monto_pagado    NUMERIC(12,0) DEFAULT 0,
  boleta_numero   VARCHAR(30),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX idx_ventas_fecha ON ventas(created_at);

-- ---------- BOLETAS ----------
CREATE TABLE boletas (
  id              SERIAL PRIMARY KEY,
  venta_id        INT REFERENCES ventas(id),
  numero          VARCHAR(30) UNIQUE NOT NULL,
  cliente_nombre  VARCHAR(150),
  cliente_rut     VARCHAR(20),
  items           JSONB NOT NULL,
  subtotal        NUMERIC(12,0),
  total           NUMERIC(12,0),
  pdf_url         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE boleta_correlativo START 1;

-- ---------- ABONOS A DEUDA ----------
CREATE TABLE pagos_deuda (
  id          SERIAL PRIMARY KEY,
  cliente_id  INT REFERENCES clientes(id),
  venta_id    INT REFERENCES ventas(id),
  monto       NUMERIC(12,0) NOT NULL,
  metodo      VARCHAR(20) DEFAULT 'efectivo',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUTIX AGENTS (Agentes de IA)
-- ============================================================
CREATE TABLE agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       VARCHAR(255) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  version         VARCHAR(50) DEFAULT '1.0.0',
  model           VARCHAR(255) NOT NULL,
  capabilities    TEXT[] DEFAULT '{}',
  memory          JSONB DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_agents_tenant ON agents(tenant_id);
CREATE INDEX idx_agents_name ON agents(name);

-- ============================================================
-- AUTIX WORKFLOWS (Flujos de trabajo)
-- ============================================================
CREATE TABLE workflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       VARCHAR(255) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  version         VARCHAR(50) DEFAULT '1.0.0',
  steps           JSONB DEFAULT '[]',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_workflows_tenant ON workflows(tenant_id);
CREATE INDEX idx_workflows_name ON workflows(name);

-- ============================================================
-- AUTIX WORKFLOW EXECUTIONS (Historial de ejecuciones)
-- ============================================================
CREATE TABLE workflow_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       VARCHAR(255) NOT NULL,
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  agent_id        UUID,
  status          VARCHAR(20) DEFAULT 'pending', -- pending, running, success, failed
  input           JSONB,
  output          JSONB,
  error_message   TEXT,
  steps_executed  JSONB DEFAULT '[]',
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_executions_tenant ON workflow_executions(tenant_id);
CREATE INDEX idx_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX idx_executions_status ON workflow_executions(status);
CREATE INDEX idx_executions_created ON workflow_executions(created_at DESC);

-- ============================================================
-- TRIGGER: actualizar saldo_deuda del cliente al insertar venta
-- ============================================================
CREATE OR REPLACE FUNCTION fn_actualizar_deuda() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado_pago IN ('pendiente','parcial') THEN
    UPDATE clientes SET saldo_deuda = saldo_deuda + (NEW.total - NEW.monto_pagado)
    WHERE id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_venta_deuda AFTER INSERT ON ventas
FOR EACH ROW EXECUTE FUNCTION fn_actualizar_deuda();

-- Al registrar abono, descuenta la deuda
CREATE OR REPLACE FUNCTION fn_registrar_abono() RETURNS TRIGGER AS $$
BEGIN
  UPDATE clientes SET saldo_deuda = GREATEST(saldo_deuda - NEW.monto, 0)
  WHERE id = NEW.cliente_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_abono_deuda AFTER INSERT ON pagos_deuda
FOR EACH ROW EXECUTE FUNCTION fn_registrar_abono();

-- Descontar stock automáticamente al confirmar pedido -> venta
CREATE OR REPLACE FUNCTION fn_descontar_stock(p_pedido_id INT) RETURNS VOID AS $$
BEGIN
  UPDATE productos p
  SET stock_kg = p.stock_kg - pi.cantidad
  FROM pedido_items pi
  WHERE pi.pedido_id = p_pedido_id AND pi.producto_id = p.id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VISTA: Dashboard operativo (usada por la vista "Dashboard" del HTML)
-- ============================================================
CREATE VIEW v_dashboard AS
SELECT
  (SELECT COUNT(*) FROM pedidos WHERE estado = 'pendiente')                                     AS pedidos_pendientes,
  (SELECT COALESCE(SUM(total),0) FROM ventas WHERE created_at::date = CURRENT_DATE)              AS ventas_hoy,
  (SELECT COALESCE(SUM(total),0) FROM ventas
     WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE))                  AS ventas_mes,
  (SELECT COALESCE(SUM(saldo_deuda),0) FROM clientes)                                            AS deuda_total,
  (SELECT COUNT(*) FROM productos WHERE stock_kg <= stock_minimo AND activo = true)               AS productos_stock_bajo,
  (SELECT COUNT(*) FROM clientes WHERE activo = true)                                             AS clientes_activos;

-- ============================================================
-- SEED mínimo para partir a probar
-- ============================================================
INSERT INTO productos (nombre, categoria, unidad, precio_mayor, precio_costo, stock_kg, stock_minimo) VALUES
('Queso Fresco Campo', 'queso fresco', 'kg', 5990, 3800, 40, 10),
('Queso Gouda Madurado', 'queso madurado', 'kg', 8990, 6200, 25, 8),
('Queso Mantecoso', 'queso fresco', 'kg', 6490, 4100, 30, 10),
('Mantequilla Artesanal', 'mantequilla', 'kg', 7490, 5000, 15, 5);
