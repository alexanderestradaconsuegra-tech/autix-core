/**
 * In-memory database mock for testing
 */
import type { Database, Agent } from './db.js';
import type { WorkflowExecution, Workflow, WorkflowStep } from './db.js';
import { randomUUID } from 'crypto';

export function createMockDatabase(): Database {
  const agents = new Map<string, Agent>();
  const workflows = new Map<string, Workflow>();
  const executions = new Map<string, WorkflowExecution>();

  return {
    listAgents: async (tenantId: string) => {
      return Array.from(agents.values())
        .filter((a) => a.tenant_id === tenantId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },

    getAgent: async (id: string, tenantId: string) => {
      const agent = agents.get(id);
      return agent && agent.tenant_id === tenantId ? agent : null;
    },

    createAgent: async (data) => {
      const id = data.id || randomUUID();
      const now = new Date().toISOString();

      const agent: Agent = {
        id,
        tenant_id: data.tenant_id,
        name: data.name,
        description: data.description || null,
        version: data.version || '1.0.0',
        model: data.model,
        capabilities: data.capabilities || [],
        memory: data.memory || {},
        metadata: data.metadata || {},
        created_at: now,
        updated_at: now,
      };

      agents.set(id, agent);
      return agent;
    },

    updateAgent: async (id: string, tenantId: string, updates) => {
      const agent = agents.get(id);
      if (!agent || agent.tenant_id !== tenantId) {
        return null;
      }

      const updated: Agent = {
        ...agent,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      agents.set(id, updated);
      return updated;
    },

    deleteAgent: async (id: string, tenantId: string) => {
      const agent = agents.get(id);
      if (!agent || agent.tenant_id !== tenantId) {
        return false;
      }
      agents.delete(id);
      return true;
    },

    listWorkflows: async (tenantId: string) => {
      return Array.from(workflows.values())
        .filter((w) => w.tenant_id === tenantId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },

    getWorkflow: async (id: string, tenantId: string) => {
      const workflow = workflows.get(id);
      return workflow && workflow.tenant_id === tenantId ? workflow : null;
    },

    createWorkflow: async (data) => {
      const id = data.id || randomUUID();
      const now = new Date().toISOString();

      const workflow: Workflow = {
        id,
        tenant_id: data.tenant_id,
        name: data.name,
        description: data.description || null,
        version: data.version || '1.0.0',
        steps: (data.steps as WorkflowStep[]) || [],
        metadata: data.metadata || {},
        created_at: now,
        updated_at: now,
      };

      workflows.set(id, workflow);
      return workflow;
    },

    updateWorkflow: async (id: string, tenantId: string, updates) => {
      const workflow = workflows.get(id);
      if (!workflow || workflow.tenant_id !== tenantId) {
        return null;
      }

      const updated: Workflow = {
        ...workflow,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      workflows.set(id, updated);
      return updated;
    },

    deleteWorkflow: async (id: string, tenantId: string) => {
      const workflow = workflows.get(id);
      if (!workflow || workflow.tenant_id !== tenantId) {
        return false;
      }
      workflows.delete(id);
      return true;
    },

    updateExecution: async (id: string, tenantId: string, updates) => {
      const execution = executions.get(id);
      if (!execution || execution.tenant_id !== tenantId) {
        return null;
      }

      const updated: WorkflowExecution = {
        ...execution,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      executions.set(id, updated);
      return updated;
    },

    getExecution: async (id: string, tenantId: string) => {
      const execution = executions.get(id);
      return execution && execution.tenant_id === tenantId ? execution : null;
    },

    createExecution: async (data) => {
      const id = data.id || randomUUID();
      const now = new Date().toISOString();

      const execution: WorkflowExecution = {
        id,
        tenant_id: data.tenant_id,
        workflow_id: data.workflow_id,
        agent_id: data.agent_id || null,
        status: data.status || 'pending',
        input: data.input || null,
        output: data.output || null,
        error_message: data.error_message || null,
        steps_executed: data.steps_executed || [],
        duration_ms: data.duration_ms || null,
        created_at: now,
        updated_at: now,
      };

      executions.set(id, execution);
      return execution;
    },

    listExecutions: async (workflowId: string, tenantId: string, limit = 50) => {
      return Array.from(executions.values())
        .filter((e) => e.workflow_id === workflowId && e.tenant_id === tenantId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);
    },
  };
}
