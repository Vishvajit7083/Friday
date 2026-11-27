import { BaseAgent } from './baseAgent.ts';
import type { OpenJarvisAgentId, AgentContext, AgentPlanStep } from '../types.ts';

export class ComputerAgent extends BaseAgent {
  readonly id: OpenJarvisAgentId = 'computer';
  readonly name = 'OpenJarvis Computer Agent';
  readonly description = 'Manages native Windows applications, Start menu software, window controls, and media keys.';
  readonly capabilities = [
    'launch_application',
    'close_application',
    'window_focus',
    'media_controls',
    'volume_adjust',
  ];

  async plan(context: AgentContext): Promise<AgentPlanStep[]> {
    const cmd = context.command.toLowerCase();
    const steps: AgentPlanStep[] = [];

    if (/\b(?:volume\s*up|sound\s*up|increase\s*volume|raise\s*volume|turn\s*up\s*volume|awaz\s*badhao|awaz\s*badha|louder)\b/i.test(cmd)) {
      steps.push({
        id: 'step-comp-1',
        agentId: this.id,
        title: 'Increase Windows system volume',
        toolName: 'computer.media_key',
        parameters: { action: 'volume_up' },
      });
    } else if (/\b(?:volume\s*down|sound\s*down|decrease\s*volume|lower\s*volume|turn\s*down\s*volume|awaz\s*kam|awaz\s*kam\s*karo|quieter)\b/i.test(cmd)) {
      steps.push({
        id: 'step-comp-1',
        agentId: this.id,
        title: 'Decrease Windows system volume',
        toolName: 'computer.media_key',
        parameters: { action: 'volume_down' },
      });
    } else if (/\b(?:mute|unmute|mute\s*audio|mute\s*sound|chup|silent|sound\s*off)\b/i.test(cmd)) {
      steps.push({
        id: 'step-comp-1',
        agentId: this.id,
        title: 'Toggle Windows audio mute',
        toolName: 'computer.media_key',
        parameters: { action: 'mute' },
      });
    } else if (/\b(?:play|pause|resume|gana\s*roko|chalao|stop\s*music|play\s*music)\b/i.test(cmd)) {
      steps.push({
        id: 'step-comp-1',
        agentId: this.id,
        title: 'Toggle media playback',
        toolName: 'computer.media_key',
        parameters: { action: 'play_pause' },
      });
    } else {
      // Extract target app name
      const appMatch = cmd.match(/(?:open|launch|start|kholo|chalu\s*karo)\s+([a-zA-Z0-9_\-.\s]+)/i);
      const appName = appMatch ? appMatch[1].trim() : cmd;
      steps.push({
        id: 'step-comp-1',
        agentId: this.id,
        title: `Launch application "${appName}"`,
        toolName: 'computer.launch_app',
        parameters: { appNameOrPath: appName },
      });
    }

    return steps;
  }
}
