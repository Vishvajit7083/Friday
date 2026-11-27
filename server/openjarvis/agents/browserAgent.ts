import { BaseAgent } from './baseAgent.ts';
import type { OpenJarvisAgentId, AgentContext, AgentPlanStep } from '../types.ts';

export class BrowserAgent extends BaseAgent {
  readonly id: OpenJarvisAgentId = 'browser';
  readonly name = 'OpenJarvis Browser Agent';
  readonly description = 'Performs live internet research, extracts article content with citations, and resolves YouTube streams.';
  readonly capabilities = [
    'web_search',
    'extractive_summarization',
    'youtube_stream_resolve',
    'domain_grounding',
  ];

  async plan(context: AgentContext): Promise<AgentPlanStep[]> {
    const cmd = context.command;
    const steps: AgentPlanStep[] = [];

    if (/youtube|video|play\s+song|gana\s+lagao|gana\s+sunao|song\s+lagao/i.test(cmd)) {
      const query = cmd
        .replace(/^(?:search\s+youtube\s+for|play\s+song|play|gana\s+lagao|gana\s+sunao)\s+/i, '')
        .trim();
      steps.push({
        id: 'step-browse-1',
        agentId: this.id,
        title: `Search YouTube and resolve media stream for "${query || cmd}"`,
        toolName: 'browser.youtube_stream',
        parameters: { query: query || cmd },
      });
    } else {
      const cleanQuery = cmd
        .replace(/^(?:google|search|internet\s+pe\s+dhundo|search\s+for)\s+/i, '')
        .trim();
      steps.push({
        id: 'step-browse-1',
        agentId: this.id,
        title: `Search live web for "${cleanQuery || cmd}"`,
        toolName: 'browser.web_search',
        parameters: { query: cleanQuery || cmd, limit: 5 },
      });
    }

    return steps;
  }
}
