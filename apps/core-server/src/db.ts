import { Pool, type PoolClient } from 'pg';

let pool: Pool | null = null;

export interface Agent {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  version: string;
  model: string;
  capabilities: string[];
  memory: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStep {
  id: string;
  toolId: string;
  connectorId: string | null;
  dependsOn: string[];
  parallelGroup: string | null;
  config?: Record<string, unknown>;
  inputMapping?: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  version: string;
  steps: WorkflowStep[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowExecution {
  id: string;
  tenant_id: string;
  workflow_id: string;
  agent_id: string | null;
  status: 'pending' | 'running' | 'success' | 'failed';
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error_message: string | null;
  steps_executed: Array<{ stepId: string; status: string; output?: unknown; error?: string }>;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  // Agents
  listAgents(tenantId: string): Promise<Agent[]>;
  getAgent(id: string, tenantId: string): Promise<Agent | null>;
  createAgent(agent: Omit<Agent, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Agent>;
  updateAgent(id: string, tenantId: string, updates: Partial<Agent>): Promise<Agent | null>;
  deleteAgent(id: string, tenantId: string): Promise<boolean>;
  // Workflows
  listWorkflows(tenantId: string): Promise<Workflow[]>;
  getWorkflow(id: string, tenantId: string): Promise<Workflow | null>;
  createWorkflow(workflow: Omit<Workflow, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Workflow>;
  updateWorkflow(id: string, tenantId: string, updates: Partial<Workflow>): Promise<Workflow | null>;
  deleteWorkflow(id: string, tenantId: string): Promise<boolean>;
  // Executions
  getExecution(id: string, tenantId: string): Promise<WorkflowExecution | null>;
  updateExecution(id: string, tenantId: string, updates: Partial<WorkflowExecution>): Promise<WorkflowExecution | null>;
  createExecution(execution: Omit<WorkflowExecution, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<WorkflowExecution>;
  listExecutions(workflowId: string, tenantId: string, limit?: number): Promise<WorkflowExecution[]>;
}

export function getPool(): Pool {
  if (!pool) {
    // Use Unix socket if POSTGRES_HOST is not explicitly set
    const host = process.env.POSTGRES_HOST || (process.env.POSTGRES_SOCKET ? process.env.POSTGRES_SOCKET : '/var/run/postgresql');
    const isSocket = host.startsWith('/');

    pool = new Pool({
      user: process.env.POSTGRES_USER || 'postgres',
      password: isSocket ? undefined : (process.env.POSTGRES_PASSWORD || 'changeme'),
      host,
      ...(isSocket ? {} : { port: parseInt(process.env.POSTGRES_PORT || '5432') }),
      database: process.env.POSTGRES_DB || 'campolac',
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function createDatabaseClient(): Database {
  return {
    listAgents,
    getAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    listWorkflows,
    getWorkflow,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    getExecution,
    updateExecution,
    createExecution,
    listExecutions,
  };
}

export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

// --- Agents CRUD ---

export async function listAgents(tenantId: string): Promise<Agent[]> {
  const result = await getPool().query('SELECT * FROM agents WHERE tenant_id = $1 ORDER BY created_at DESC', [
    tenantId,
  ]);
  return result.rows as Agent[];
}

export async function getAgent(id: string, tenantId: string): Promise<Agent | null> {
  const result = await getPool().query('SELECT * FROM agents WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (result.rows[0] as Agent | undefined) || null;
}

export async function createAgent(
  agent: Omit<Agent, 'id' | 'created_at' | 'updated_at'> & { id?: string },
): Promise<Agent> {
  const id = agent.id || generateId();
  const result = await getPool().query(
    `INSERT INTO agents (id, tenant_id, name, description, version, model, capabilities, memory, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      agent.tenant_id,
      agent.name,
      agent.description || null,
      agent.version,
      agent.model,
      agent.capabilities,
      JSON.stringify(agent.memory),
      JSON.stringify(agent.metadata),
    ],
  );
  return (result.rows[0] as Agent) || null;
}

export async function updateAgent(id: string, tenantId: string, updates: Partial<Agent>): Promise<Agent | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.model !== undefined) {
    fields.push(`model = $${paramIndex++}`);
    values.push(updates.model);
  }
  if (updates.capabilities !== undefined) {
    fields.push(`capabilities = $${paramIndex++}`);
    values.push(updates.capabilities);
  }
  if (updates.memory !== undefined) {
    fields.push(`memory = $${paramIndex++}`);
    values.push(JSON.stringify(updates.memory));
  }
  if (updates.metadata !== undefined) {
    fields.push(`metadata = $${paramIndex++}`);
    values.push(JSON.stringify(updates.metadata));
  }

  if (fields.length === 0) {
    return getAgent(id, tenantId);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);
  values.push(tenantId);

  const query = `UPDATE agents SET ${fields.join(', ')} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} RETURNING *`;

  const result = await getPool().query(query, values);
  return (result.rows[0] as Agent | undefined) || null;
}

export async function deleteAgent(id: string, tenantId: string): Promise<boolean> {
  const result = await getPool().query('DELETE FROM agents WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return result.rowCount ? result.rowCount > 0 : false;
}

// --- Workflows CRUD ---

export async function listWorkflows(tenantId: string): Promise<Workflow[]> {
  const result = await getPool().query('SELECT * FROM workflows WHERE tenant_id = $1 ORDER BY created_at DESC', [
    tenantId,
  ]);
  return result.rows as Workflow[];
}

export async function getWorkflow(id: string, tenantId: string): Promise<Workflow | null> {
  const result = await getPool().query('SELECT * FROM workflows WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (result.rows[0] as Workflow | undefined) || null;
}

export async function createWorkflow(
  workflow: Omit<Workflow, 'id' | 'created_at' | 'updated_at'> & { id?: string },
): Promise<Workflow> {
  const id = workflow.id || generateId();
  const result = await getPool().query(
    `INSERT INTO workflows (id, tenant_id, name, description, version, steps, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      id,
      workflow.tenant_id,
      workflow.name,
      workflow.description || null,
      workflow.version,
      JSON.stringify(workflow.steps),
      JSON.stringify(workflow.metadata),
    ],
  );
  return (result.rows[0] as Workflow) || null;
}

export async function updateWorkflow(id: string, tenantId: string, updates: Partial<Workflow>): Promise<Workflow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.steps !== undefined) {
    fields.push(`steps = $${paramIndex++}`);
    values.push(JSON.stringify(updates.steps));
  }
  if (updates.metadata !== undefined) {
    fields.push(`metadata = $${paramIndex++}`);
    values.push(JSON.stringify(updates.metadata));
  }

  if (fields.length === 0) {
    return getWorkflow(id, tenantId);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);
  values.push(tenantId);

  const query = `UPDATE workflows SET ${fields.join(', ')} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} RETURNING *`;

  const result = await getPool().query(query, values);
  return (result.rows[0] as Workflow | undefined) || null;
}

export async function deleteWorkflow(id: string, tenantId: string): Promise<boolean> {
  const result = await getPool().query('DELETE FROM workflows WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return result.rowCount ? result.rowCount > 0 : false;
}

// --- Workflow Executions ---

export async function createExecution(
  execution: Omit<WorkflowExecution, 'id' | 'created_at' | 'updated_at'> & { id?: string },
): Promise<WorkflowExecution> {
  const id = execution.id || generateId();
  const result = await getPool().query(
    `INSERT INTO workflow_executions (id, tenant_id, workflow_id, agent_id, status, input, output, error_message, steps_executed, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id,
      execution.tenant_id,
      execution.workflow_id,
      execution.agent_id || null,
      execution.status,
      JSON.stringify(execution.input),
      JSON.stringify(execution.output),
      execution.error_message || null,
      JSON.stringify(execution.steps_executed),
      execution.duration_ms || null,
    ],
  );
  return (result.rows[0] as WorkflowExecution) || null;
}

export async function updateExecution(id: string, tenantId: string, updates: Partial<WorkflowExecution>): Promise<WorkflowExecution | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.output !== undefined) {
    fields.push(`output = $${paramIndex++}`);
    values.push(JSON.stringify(updates.output));
  }
  if (updates.error_message !== undefined) {
    fields.push(`error_message = $${paramIndex++}`);
    values.push(updates.error_message);
  }
  if (updates.steps_executed !== undefined) {
    fields.push(`steps_executed = $${paramIndex++}`);
    values.push(JSON.stringify(updates.steps_executed));
  }
  if (updates.duration_ms !== undefined) {
    fields.push(`duration_ms = $${paramIndex++}`);
    values.push(updates.duration_ms);
  }

  if (fields.length === 0) {
    return getExecution(id, tenantId);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);
  values.push(tenantId);

  const query = `UPDATE workflow_executions SET ${fields.join(', ')} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} RETURNING *`;

  const result = await getPool().query(query, values);
  return (result.rows[0] as WorkflowExecution | undefined) || null;
}

export async function getExecution(id: string, tenantId: string): Promise<WorkflowExecution | null> {
  const result = await getPool().query(
    'SELECT * FROM workflow_executions WHERE id = $1 AND tenant_id = $2',
    [id, tenantId],
  );
  return (result.rows[0] as WorkflowExecution | undefined) || null;
}

export async function listExecutions(workflowId: string, tenantId: string, limit = 50): Promise<WorkflowExecution[]> {
  const result = await getPool().query(
    'SELECT * FROM workflow_executions WHERE workflow_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT $3',
    [workflowId, tenantId, limit],
  );
  return result.rows as WorkflowExecution[];
}

function generateId(): string {
  // Simple UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
