import type {
  OpenJarvisAgentId,
  AgentContext,
  StepExecutionResult,
  HardwareProfile,
  ModelCatalogItem,
} from '../types.ts';
import { profileSystemHardware } from '../intelligence/hardwareProfiler.ts';
import { getOpenJarvisModelCatalog } from '../intelligence/modelCatalog.ts';
import { LocalCoreEngine } from '../engine/localCoreEngine.ts';
import { LlamaCppEngine } from '../engine/llamaCppEngine.ts';
import type { InferenceEngine } from '../engine/inferenceEngine.ts';
import { defaultToolRegistry, OpenJarvisToolRegistry } from '../tools/toolRegistry.ts';
import { defaultTraceRecorder, OpenJarvisTraceRecorder } from '../learning/traceRecorder.ts';

// Specialized agents
import { BaseAgent } from '../agents/baseAgent.ts';
import { CoreAgent } from '../agents/coreAgent.ts';
import { ComputerAgent } from '../agents/computerAgent.ts';
import { FileAgent } from '../agents/fileAgent.ts';
import { CodingAgent } from '../agents/codingAgent.ts';
import { BrowserAgent } from '../agents/browserAgent.ts';
import { VoiceAgent } from '../agents/voiceAgent.ts';
import { SystemAgent } from '../agents/systemAgent.ts';
import { MemoryAgent } from '../agents/memoryAgent.ts';
import { WorkflowAgent } from '../agents/workflowAgent.ts';

export interface OpenJarvisTurnResult {
  reply: string;
  activeAgents: OpenJarvisAgentId[];
  steps: StepExecutionResult[];
  requiresConfirmation: boolean;
  confirmationSummary?: string;
  artifacts?: string[];
  durationMs: number;
  engineUsed: string;
  tokensEstimated: number;
}

export class OpenJarvisOrchestrator {
  private agents = new Map<OpenJarvisAgentId, BaseAgent>();
  private localCoreEngine: LocalCoreEngine;
  private llamaCppEngine: LlamaCppEngine;
  private toolRegistry: OpenJarvisToolRegistry;
  private traceRecorder: OpenJarvisTraceRecorder;

  constructor() {
    this.toolRegistry = defaultToolRegistry;
    this.traceRecorder = defaultTraceRecorder;
    this.localCoreEngine = new LocalCoreEngine();
    this.llamaCppEngine = new LlamaCppEngine();

    // Register all 9 agents
    this.registerAgent(new CoreAgent(this.toolRegistry));
    this.registerAgent(new ComputerAgent(this.toolRegistry));
    this.registerAgent(new FileAgent(this.toolRegistry));
    this.registerAgent(new CodingAgent(this.toolRegistry));
    this.registerAgent(new BrowserAgent(this.toolRegistry));
    this.registerAgent(new VoiceAgent(this.toolRegistry));
    this.registerAgent(new SystemAgent(this.toolRegistry));
    this.registerAgent(new MemoryAgent(this.toolRegistry));
    this.registerAgent(new WorkflowAgent(this.toolRegistry));
  }

  private registerAgent(agent: BaseAgent) {
    this.agents.set(agent.id, agent);
  }

  getAgent(id: OpenJarvisAgentId): BaseAgent | undefined {
    return this.agents.get(id);
  }

  listAgents(): { id: OpenJarvisAgentId; name: string; description: string; capabilities: string[] }[] {
    return Array.from(this.agents.values()).map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      capabilities: a.capabilities,
    }));
  }

  getHardwareProfile(): HardwareProfile {
    return profileSystemHardware();
  }

  getModelCatalog(): ModelCatalogItem[] {
    const profile = this.getHardwareProfile();
    return getOpenJarvisModelCatalog(profile);
  }

  async getActiveEngine(): Promise<InferenceEngine> {
    const isLlamaAvailable = await this.llamaCppEngine.isAvailable();
    if (isLlamaAvailable) {
      return this.llamaCppEngine;
    }
    return this.localCoreEngine;
  }

  async processCommand(
    command: string,
    confirmed = false,
    onToken?: (token: string) => void
  ): Promise<OpenJarvisTurnResult> {
    const started = Date.now();
    const hardware = this.getHardwareProfile();

    const context: AgentContext = {
      sessionId: `sess-${Date.now().toString(36)}`,
      command,
      confirmed,
      hardwareProfile: hardware,
    };

    const coreAgent = this.agents.get('core') as CoreAgent;
    const targetAgentIds = coreAgent.resolveAgentsForCommand(command);

    const executedSteps: StepExecutionResult[] = [];
    let requiresConfirmation = false;
    let confirmationSummary: string | undefined;
    const collectedArtifacts: string[] = [];
    const replyChunks: string[] = [];

    // Execute steps across delegated agents
    for (const agentId of targetAgentIds) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;

      const plannedSteps = await agent.plan(context);

      for (const step of plannedSteps) {
        if (step.requiresConfirmation && !confirmed) {
          requiresConfirmation = true;
          confirmationSummary = step.confirmationPrompt || `Confirm execution of ${step.title}`;
          executedSteps.push({
            stepId: step.id,
            agentId,
            title: step.title,
            toolName: step.toolName,
            status: 'pending_confirmation',
            detail: confirmationSummary,
            verified: false,
            durationMs: 1,
          });
          continue;
        }

        const stepResult = await agent.execute(step, context);
        executedSteps.push(stepResult);

        if (stepResult.artifacts) {
          collectedArtifacts.push(...stepResult.artifacts);
        }

        if (stepResult.detail) {
          replyChunks.push(stepResult.detail);
        }
      }
    }

    let finalReply = '';
    const activeEngine = await this.getActiveEngine();

    if (requiresConfirmation) {
      finalReply = `Confirmation required before proceeding with: "${command}".\n${confirmationSummary || 'Please approve to execute.'}`;
    } else if (replyChunks.length > 0) {
      finalReply = replyChunks.join('\n');
    } else {
      // Fallback to active engine generation
      const gen = await activeEngine.generate(command);
      finalReply = gen.text;
    }

    if (onToken) {
      const tokens = finalReply.split(/(?<=\s)/);
      for (const t of tokens) {
        onToken(t);
      }
    }

    const durationMs = Math.max(1, Date.now() - started);
    const tokensEstimated = Math.max(1, Math.round(finalReply.length / 4));

    // Record trace
    this.traceRecorder.recordTrace({
      command,
      agentIds: targetAgentIds,
      totalDurationMs: durationMs,
      tokensEstimated,
      success: !executedSteps.some((s) => s.status === 'failed'),
      steps: executedSteps,
    });

    return {
      reply: finalReply,
      activeAgents: targetAgentIds,
      steps: executedSteps,
      requiresConfirmation,
      confirmationSummary,
      artifacts: collectedArtifacts.length > 0 ? collectedArtifacts : undefined,
      durationMs,
      engineUsed: activeEngine.id,
      tokensEstimated,
    };
  }
}

export const defaultOpenJarvisOrchestrator = new OpenJarvisOrchestrator();
