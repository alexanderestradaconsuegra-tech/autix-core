import type { Registry } from '@autix/core';
import type { Workflow, WorkflowStep } from '../db.js';

export interface ParsedWorkflowStep {
  id: string;
  toolId: string;
  connectorId: string;
  dependsOn?: string[];
  config?: Record<string, unknown>;
  inputMapping?: Record<string, unknown>;
}

export interface ParsedWorkflow {
  id: string;
  name: string;
  steps: ParsedWorkflowStep[];
  executionPlan: ExecutionBatch[];
  dependencyGraph: Map<string, Set<string>>;
}

export interface ExecutionBatch {
  batchId: number;
  stepIds: string[];
}

/**
 * Valida y normaliza un Workflow de la BD
 * - Verifica que cada toolId exista en el Registry
 * - Valida que cada connectorId sea consistente
 * - Detecta ciclos de dependencia
 * - Calcula el plan de ejecución
 */
export class WorkflowParser {
  constructor(private registry: Registry) {}

  parse(workflow: Workflow): ParsedWorkflow {
    const steps = workflow.steps || [];

    // Validar estructura básica
    if (!Array.isArray(steps)) {
      throw new Error(`Workflow ${workflow.id}: steps debe ser un array`);
    }

    // Validar que cada step tiene toolId y connectorId
    for (const step of steps) {
      if (!step.toolId) {
        throw new Error(`Workflow ${workflow.id}: step ${step.id} sin toolId`);
      }
      if (!step.connectorId) {
        throw new Error(`Workflow ${workflow.id}: step ${step.id} sin connectorId`);
      }

      // Validar que toolId existe en Registry
      try {
        const tool = this.registry.getTool(step.toolId);
        // Validar que connectorId es consistente
        if (tool.connectorId !== step.connectorId) {
          throw new Error(
            `Workflow ${workflow.id} step ${step.id}: connectorId declarado "${step.connectorId}" ` +
              `no coincide con connectorId real de la Tool "${tool.connectorId}"`,
          );
        }
      } catch (error) {
        throw new Error(
          `Workflow ${workflow.id} step ${step.id}: toolId "${step.toolId}" no existe en Registry`,
        );
      }
    }

    // Detectar ciclos de dependencia usando DFS
    this.detectCycles(steps);

    // Calcular plan de ejecución
    const executionPlan = this.calculateExecutionPlan(steps);

    // Construir grafo de dependencias
    const dependencyGraph = this.buildDependencyGraph(steps);

    const parsedSteps: ParsedWorkflowStep[] = steps.map((step) => ({
      id: step.id,
      toolId: step.toolId,
      connectorId: step.connectorId,
      dependsOn: step.dependsOn,
      config: step.config,
      inputMapping: step.inputMapping,
    }));

    return {
      id: workflow.id,
      name: workflow.name,
      steps: parsedSteps,
      executionPlan,
      dependencyGraph,
    };
  }

  private detectCycles(steps: WorkflowStep[]): void {
    const stepsById = new Map(steps.map((s) => [s.id, s]));
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (stepId: string, path: string[]): void => {
      if (recursionStack.has(stepId)) {
        throw new Error(`Ciclo detectado en dependencias: ${[...path, stepId].join(' -> ')}`);
      }

      if (visited.has(stepId)) {
        return;
      }

      recursionStack.add(stepId);
      const step = stepsById.get(stepId);

      if (step?.dependsOn) {
        for (const depId of step.dependsOn) {
          dfs(depId, [...path, stepId]);
        }
      }

      recursionStack.delete(stepId);
      visited.add(stepId);
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        dfs(step.id, []);
      }
    }
  }

  private calculateExecutionPlan(steps: WorkflowStep[]): ExecutionBatch[] {
    const stepsById = new Map(steps.map((s) => [s.id, s]));
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, Set<string>>();

    // Inicializar
    for (const step of steps) {
      inDegree.set(step.id, (step.dependsOn ?? []).length);
      if (!dependents.has(step.id)) {
        dependents.set(step.id, new Set());
      }
    }

    // Construir grafo de dependientes
    for (const step of steps) {
      for (const depId of step.dependsOn ?? []) {
        if (!dependents.has(depId)) {
          dependents.set(depId, new Set());
        }
        dependents.get(depId)!.add(step.id);
      }
    }

    // Topological sort con batches
    const batches: ExecutionBatch[] = [];
    const processed = new Set<string>();
    let batchId = 0;

    while (processed.size < steps.length) {
      const readySteps = [...inDegree.entries()]
        .filter(([stepId, degree]) => degree === 0 && !processed.has(stepId))
        .map(([stepId]) => stepId);

      if (readySteps.length === 0) {
        throw new Error('No hay steps listos pero aún hay steps sin procesar (ciclo o dependencia rota)');
      }

      batches.push({
        batchId,
        stepIds: readySteps,
      });

      for (const stepId of readySteps) {
        processed.add(stepId);
        for (const dependentId of dependents.get(stepId) ?? []) {
          inDegree.set(dependentId, (inDegree.get(dependentId) ?? 1) - 1);
        }
      }

      batchId += 1;
    }

    return batches;
  }

  private buildDependencyGraph(steps: WorkflowStep[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    for (const step of steps) {
      if (!graph.has(step.id)) {
        graph.set(step.id, new Set());
      }
      for (const depId of step.dependsOn ?? []) {
        graph.get(step.id)!.add(depId);
      }
    }

    return graph;
  }
}
