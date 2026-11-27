import { BaseAgent } from './baseAgent.ts';
import type { OpenJarvisAgentId, AgentContext, AgentPlanStep } from '../types.ts';
import { normalizeUnicodeAndDevanagari } from '../../../src/core/cognitive/hinglishNlp.ts';

export class CoreAgent extends BaseAgent {
  readonly id: OpenJarvisAgentId = 'core';
  readonly name = 'OpenJarvis Core Agent';
  readonly description = 'Supervisor and orchestrator. Decomposes intents, routes to specialized agents, and gates destructive actions.';
  readonly capabilities = [
    'intent_decomposition',
    'multi_agent_routing',
    'destructive_action_gating',
    'synthesis_and_aggregation',
  ];

  async plan(context: AgentContext): Promise<AgentPlanStep[]> {
    const raw = context.command;
    const normalized = normalizeUnicodeAndDevanagari(raw);
    const lower = normalized.toLowerCase();

    const targetAgents = this.resolveAgentsForCommand(lower);

    return [
      {
        id: 'step-core-route',
        agentId: this.id,
        title: `Analyze intent and delegate to [${targetAgents.join(', ')}]`,
        parameters: { targetAgents, normalizedCommand: normalized },
      },
    ];
  }

  resolveAgentsForCommand(command: string): OpenJarvisAgentId[] {
    const lower = command.toLowerCase();

    // 1. Coding / Scaffolding
    if (/\b(?:create|make|scaffold|write|build)\b.*\b(?:project|app|code|script|sign-in|login|html|css|python|react|typescript|node)\b/i.test(lower)) {
      return ['coding'];
    }

    // 2. Hardware / Telemetry
    if (/\b(?:cpu|ram|memory|battery|gpu|hardware|performance|specs|processes)\b/i.test(lower)) {
      return ['system'];
    }

    // 3. Media / Songs / YouTube
    if (/\b(?:song|music|gana|youtube|video|stream|audio)\b/i.test(lower)) {
      return ['browser', 'computer'];
    }

    // 4. File Search & Management
    if (/\b(?:search|find|locate|dhundo|files?|folder|directory|preview|explorer)\b/i.test(lower)) {
      return ['file'];
    }

    // 5. Windows Apps & System Controls
    if (/\b(?:open|launch|kholo|chalu|volume|sound|mute|app|application|calculator|notepad|chrome)\b/i.test(lower)) {
      return ['computer'];
    }

    // 6. Memory & Knowledge
    if (/\b(?:remember|yaad|what is my|who am i|facts?)\b/i.test(lower)) {
      return ['memory'];
    }

    // 7. General Web Research
    if (/\b(?:who is|what is|when did|weather|search|news|explain)\b/i.test(lower)) {
      return ['browser'];
    }

    return ['core'];
  }
}
