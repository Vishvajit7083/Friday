import { BaseAgent } from './baseAgent.ts';
import type { OpenJarvisAgentId, AgentContext, AgentPlanStep } from '../types.ts';

export class SystemAgent extends BaseAgent {
  readonly id: OpenJarvisAgentId = 'system';
  readonly name = 'OpenJarvis System Agent';
  readonly description = 'Monitors host hardware telemetry, CPU loads, memory limits, battery state, and active OS processes.';
  readonly capabilities = [
    'cpu_monitoring',
    'memory_monitoring',
    'battery_telemetry',
    'process_inspection',
    'hardware_diagnostics',
  ];

  async plan(context: AgentContext): Promise<AgentPlanStep[]> {
    return [
      {
        id: 'step-sys-1',
        agentId: this.id,
        title: 'Query host hardware telemetry and top processes',
        toolName: 'system.get_telemetry',
        parameters: {},
      },
    ];
  }
}
