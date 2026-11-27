import { BaseAgent } from './baseAgent.ts';
import type { OpenJarvisAgentId, AgentContext, AgentPlanStep } from '../types.ts';

export class MemoryAgent extends BaseAgent {
  readonly id: OpenJarvisAgentId = 'memory';
  readonly name = 'OpenJarvis Memory Agent';
  readonly description = 'Manages 6-layer persistent SQLite memory, stores user facts, retrieves past interactions, and maintains context.';
  readonly capabilities = [
    'semantic_fact_storage',
    'working_memory_retrieval',
    'episodic_trace_lookup',
    'preference_profile_management',
  ];

  async plan(context: AgentContext): Promise<AgentPlanStep[]> {
    const cmd = context.command;
    const steps: AgentPlanStep[] = [];

    const rememberMatch = cmd.match(/(?:remember|yaad\s*rakho|note\s*that)\s+(?:that\s+)?(.+)/i);
    if (rememberMatch) {
      const fact = rememberMatch[1].trim();
      steps.push({
        id: 'step-mem-1',
        agentId: this.id,
        title: `Persist memory: "${fact}"`,
        toolName: 'memory.save_fact',
        parameters: {
          key: `fact_${Date.now()}`,
          value: fact,
          category: 'user_fact',
        },
      });
    } else {
      steps.push({
        id: 'step-mem-1',
        agentId: this.id,
        title: 'Retrieve relevant memories from 6-layer SQLite store',
        toolName: 'memory.query',
        parameters: { limit: 10 },
      });
    }

    return steps;
  }
}
