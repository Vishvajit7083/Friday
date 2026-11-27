import { BaseAgent } from './baseAgent.ts';
import type { OpenJarvisAgentId, AgentContext, AgentPlanStep, CodingProjectConfig } from '../types.ts';

export class CodingAgent extends BaseAgent {
  readonly id: OpenJarvisAgentId = 'coding';
  readonly name = 'OpenJarvis Coding Agent';
  readonly description = 'Autonomous coding agent. Scaffolds full software projects (React, Python, Node, HTML), validates files, and opens code in VS Code.';
  readonly capabilities = [
    'scaffold_project',
    'write_python_script',
    'scaffold_react_app',
    'verify_code_syntax',
    'open_in_vscode',
    'run_automated_tests',
  ];

  async plan(context: AgentContext): Promise<AgentPlanStep[]> {
    const cmd = context.command.toLowerCase();
    const steps: AgentPlanStep[] = [];

    let projectType: CodingProjectConfig['projectType'] = 'vanilla_web';
    if (cmd.includes('python')) {
      projectType = 'python_script';
    } else if (cmd.includes('react') || cmd.includes('typescript') || cmd.includes('ts')) {
      projectType = 'react_ts';
    } else if (cmd.includes('node') || cmd.includes('express') || cmd.includes('api')) {
      projectType = 'node_express';
    }

    // Extract project name: prefer "named <name>" or "called <name>", then "project <name>"
    const nameMatch = cmd.match(/(?:named|called)\s+["']?([a-zA-Z0-9_\-]+)["']?/i) ||
                      cmd.match(/(?:project|app)\s+["']?([a-zA-Z0-9_\-]+)["']?/i);
    const projectName = nameMatch && nameMatch[1] !== 'a' && nameMatch[1] !== 'new' && nameMatch[1] !== 'project'
      ? nameMatch[1]
      : `friday-app-${Date.now().toString(36)}`;

    const openInVsCode = /open\s+(?:in\s+)?(?:vs\s*code|editor)|code\s+kholo/i.test(cmd);

    steps.push({
      id: 'step-code-1',
      agentId: this.id,
      title: `Scaffold ${projectType} project "${projectName}"`,
      toolName: 'coding.scaffold_project',
      parameters: {
        projectType,
        projectName,
        features: ['Responsive UI', 'Form validation', 'Local storage persistence'],
        openInVsCode,
      },
    });

    steps.push({
      id: 'step-code-2',
      agentId: this.id,
      title: `Verify structure and integrity for "${projectName}"`,
      toolName: 'coding.verify_and_test',
      parameters: {
        projectPath: `.friday-data/projects/${projectName}`,
      },
      dependencies: ['step-code-1'],
    });

    return steps;
  }
}
