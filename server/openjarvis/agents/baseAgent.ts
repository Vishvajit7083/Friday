import type {
  OpenJarvisAgentId,
  AgentContext,
  AgentPlanStep,
  StepExecutionResult,
  VerificationResult,
  ReflectionResult,
} from '../types.ts';
import { defaultToolRegistry, OpenJarvisToolRegistry } from '../tools/toolRegistry.ts';

export abstract class BaseAgent {
  abstract readonly id: OpenJarvisAgentId;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly capabilities: string[];

  protected toolRegistry: OpenJarvisToolRegistry;

  constructor(toolRegistry: OpenJarvisToolRegistry = defaultToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  abstract plan(context: AgentContext): Promise<AgentPlanStep[]>;

  async execute(step: AgentPlanStep, context: AgentContext): Promise<StepExecutionResult> {
    const started = Date.now();
    if (!step.toolName) {
      return {
        stepId: step.id,
        agentId: this.id,
        title: step.title,
        toolName: step.toolName,
        status: 'completed',
        output: step.title,
        verified: true,
        durationMs: Math.max(1, Date.now() - started),
      };
    }

    const toolRes = await this.toolRegistry.executeTool(step.toolName, step.parameters || {}, context);
    const durationMs = Math.max(1, Date.now() - started);

    return {
      stepId: step.id,
      agentId: this.id,
      title: step.title,
      toolName: step.toolName,
      status: toolRes.success ? 'completed' : 'failed',
      output: toolRes.data,
      error: toolRes.error,
      detail: toolRes.detail,
      artifacts: toolRes.artifacts,
      verified: toolRes.success,
      durationMs,
    };
  }

  async verify(step: AgentPlanStep, result: StepExecutionResult): Promise<VerificationResult> {
    if (result.status === 'completed' && !result.error) {
      return { passed: true };
    }
    return {
      passed: false,
      reason: result.error || 'Execution status failed',
      retryRecommended: true,
    };
  }

  async reflect(turnSummary: { command: string; success: boolean; durationMs: number }): Promise<ReflectionResult> {
    return {
      lessonsLearned: [
        `Executed command "${turnSummary.command}" with ${turnSummary.success ? 'success' : 'failure'} in ${turnSummary.durationMs}ms`,
      ],
    };
  }
}
