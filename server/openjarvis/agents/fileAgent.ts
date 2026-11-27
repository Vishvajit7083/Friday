import { BaseAgent } from './baseAgent.ts';
import type { OpenJarvisAgentId, AgentContext, AgentPlanStep } from '../types.ts';

export class FileAgent extends BaseAgent {
  readonly id: OpenJarvisAgentId = 'file';
  readonly name = 'OpenJarvis File Agent';
  readonly description = 'Indexes desktop and documents directories, performs fuzzy search, reads previews, and reveals files in Explorer.';
  readonly capabilities = [
    'search_files',
    'read_file_preview',
    'create_folder',
    'reveal_in_explorer',
    'filter_extensions',
  ];

  async plan(context: AgentContext): Promise<AgentPlanStep[]> {
    const cmd = context.command;
    const steps: AgentPlanStep[] = [];

    if (/reveal|show\s+in\s+explorer|folder\s+me\s+dikhao/i.test(cmd)) {
      const pathMatch = cmd.match(/(?:path|file|folder)\s+["']?([^"']+)["']?/i);
      const targetPath = pathMatch ? pathMatch[1].trim() : '.';
      steps.push({
        id: 'step-file-1',
        agentId: this.id,
        title: `Reveal "${targetPath}" in Windows Explorer`,
        toolName: 'file.reveal_in_explorer',
        parameters: { targetPath },
      });
    } else if (/preview|read\s+file|read\s+code/i.test(cmd)) {
      const pathMatch = cmd.match(/(?:file|path)\s+["']?([^"']+)["']?/i);
      const filePath = pathMatch ? pathMatch[1].trim() : cmd;
      steps.push({
        id: 'step-file-1',
        agentId: this.id,
        title: `Read file preview for "${filePath}"`,
        toolName: 'file.read_preview',
        parameters: { filePath },
      });
    } else {
      // Natural file search
      const cleanQuery = cmd
        .replace(/^(?:search|find|dhundo|look for|locate)\s+(?:for\s+)?(?:files?\s+)?/i, '')
        .trim();
      steps.push({
        id: 'step-file-1',
        agentId: this.id,
        title: `Search local files for "${cleanQuery || cmd}"`,
        toolName: 'file.search',
        parameters: { query: cleanQuery || cmd },
      });
    }

    return steps;
  }
}
