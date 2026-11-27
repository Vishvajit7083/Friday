import { BaseAgent } from './baseAgent.ts';
import type {
  OpenJarvisAgentId,
  AgentContext,
  AgentPlanStep,
  WorkflowExecutionPlan,
  WorkflowDAGNode,
  WorkflowState,
} from '../types.ts';

export class WorkflowAgent extends BaseAgent {
  readonly id: OpenJarvisAgentId = 'workflow';
  readonly name = 'OpenJarvis Workflow Agent';
  readonly description = 'Executes multi-step DAG workflows with states (CREATED -> RUNNING -> COMPLETED), retries, and verification.';
  readonly capabilities = [
    'dag_workflow_planning',
    'step_dependency_tracking',
    'automatic_retries',
    'confirmation_gating',
    'workflow_lifecycle_management',
  ];

  async plan(context: AgentContext): Promise<AgentPlanStep[]> {
    return [
      {
        id: 'step-wf-1',
        agentId: this.id,
        title: `Plan and execute DAG workflow for "${context.command}"`,
      },
    ];
  }

  createDAGPlan(goal: string, nodes: WorkflowDAGNode[]): WorkflowExecutionPlan {
    const requiresConfirmation = nodes.some((n) => n.toolName?.includes('destructive') || n.toolName?.includes('delete'));
    return {
      id: `wf-${Date.now().toString(36)}`,
      goal,
      state: 'READY',
      createdAt: new Date().toISOString(),
      nodes,
      progressPercent: 0,
      requiresConfirmation,
      confirmationSummary: requiresConfirmation ? `Requires approval to execute destructive steps in "${goal}"` : undefined,
      completedNodeIds: [],
      artifacts: [],
    };
  }

  async executeDAG(plan: WorkflowExecutionPlan, context: AgentContext): Promise<WorkflowExecutionPlan> {
    if (plan.requiresConfirmation && !context.confirmed) {
      plan.state = 'WAITING';
      return plan;
    }

    plan.state = 'RUNNING';

    for (const node of plan.nodes) {
      // Check if dependencies completed
      const depsSatisfied = node.dependsOn.every((depId) => plan.completedNodeIds.includes(depId));
      if (!depsSatisfied) {
        node.status = 'skipped';
        continue;
      }

      node.status = 'running';
      plan.activeNodeId = node.id;

      let attempts = 0;
      let success = false;

      while (attempts <= node.maxRetries && !success) {
        attempts++;
        try {
          if (node.toolName) {
            const toolRes = await this.toolRegistry.executeTool(node.toolName, node.parameters || {}, context);
            if (toolRes.success) {
              node.output = toolRes.data;
              node.artifacts = toolRes.artifacts;
              if (toolRes.artifacts) {
                plan.artifacts.push(...toolRes.artifacts);
              }
              success = true;
            } else {
              node.error = toolRes.error;
            }
          } else {
            success = true;
          }
        } catch (err) {
          node.error = err instanceof Error ? err.message : String(err);
        }
      }

      if (success) {
        node.status = 'completed';
        plan.completedNodeIds.push(node.id);
      } else {
        node.status = 'failed';
        plan.state = 'FAILED';
        return plan;
      }

      plan.progressPercent = Math.round((plan.completedNodeIds.length / plan.nodes.length) * 100);
    }

    plan.state = 'COMPLETED';
    plan.progressPercent = 100;
    return plan;
  }
}
