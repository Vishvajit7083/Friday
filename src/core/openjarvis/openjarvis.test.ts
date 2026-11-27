import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

import {
  profileSystemHardware,
  getOpenJarvisModelCatalog,
  OpenJarvisToolRegistry,
  defaultToolRegistry,
  OpenJarvisTraceRecorder,
  defaultTraceRecorder,
  OpenJarvisOrchestrator,
  defaultOpenJarvisOrchestrator,
  CodingAgent,
  ComputerAgent,
  FileAgent,
  WorkflowAgent,
  CoreAgent,
  type WorkflowDAGNode,
} from '../../../server/openjarvis/index.ts';

test('OpenJarvis Intelligence: hardwareProfiler returns valid CPU, RAM, and model tier recommendation', () => {
  const profile = profileSystemHardware(true);
  assert.ok(profile.logicalCores >= 1, 'Must have at least 1 logical core');
  assert.ok(profile.totalRamMb > 0, 'Total RAM must be positive');
  assert.ok(typeof profile.cpuModel === 'string', 'CPU model must be string');
  assert.ok(['ultra_light', 'light', 'standard', 'heavy'].includes(profile.recommendedTier));
  assert.equal(profile.recommendedModelId, 'friday-local-core');
});

test('OpenJarvis Intelligence: modelCatalog includes zero-download Built-in LocalCore and optional GGUF models', () => {
  const catalog = getOpenJarvisModelCatalog();
  assert.ok(catalog.length >= 4, 'Catalog must contain built-in and GGUF models');

  const localCore = catalog.find((m) => m.id === 'friday-local-core');
  assert.ok(localCore, 'Must include friday-local-core');
  assert.equal(localCore?.downloaded, true, 'friday-local-core must be already downloaded/ready');
  assert.equal(localCore?.status, 'ready');
  assert.equal(localCore?.sizeBytes, 0, 'Must have 0 bytes download');

  const qwen05 = catalog.find((m) => m.id === 'qwen2.5-0.5b-instruct');
  assert.ok(qwen05, 'Must include qwen2.5-0.5b-instruct');
  assert.equal(qwen05?.format, 'gguf');
  assert.ok(qwen05?.downloadUrl?.includes('huggingface.co'));
});

test('OpenJarvis Tools: defaultToolRegistry contains computer, file, coding, browser, system, and memory tools', async () => {
  const tools = defaultToolRegistry.listTools();
  assert.ok(tools.length >= 10, 'Must register at least 10 core tools');

  const toolNames = tools.map((t) => t.name);
  assert.ok(toolNames.includes('computer.launch_app'));
  assert.ok(toolNames.includes('computer.media_key'));
  assert.ok(toolNames.includes('file.search'));
  assert.ok(toolNames.includes('file.read_preview'));
  assert.ok(toolNames.includes('coding.scaffold_project'));
  assert.ok(toolNames.includes('coding.verify_and_test'));
  assert.ok(toolNames.includes('browser.web_search'));
  assert.ok(toolNames.includes('system.get_telemetry'));
  assert.ok(toolNames.includes('memory.save_fact'));
  assert.ok(toolNames.includes('memory.query'));

  // Test system telemetry execution
  const telemRes = await defaultToolRegistry.executeTool('system.get_telemetry', {}, {
    sessionId: 'test',
    command: 'check telemetry',
    confirmed: true,
  });
  assert.equal(telemRes.success, true);
  assert.ok(telemRes.detail?.includes('CPU:'));
});

test('OpenJarvis CodingAgent: scaffolds complete web or python project and verifies artifacts', async () => {
  const testDir = path.resolve(process.cwd(), '.friday-data', 'test-projects');
  const projectName = `test-signin-${Date.now()}`;

  const scaffoldRes = await defaultToolRegistry.executeTool(
    'coding.scaffold_project',
    {
      projectType: 'vanilla_web',
      projectName,
      targetDirectory: testDir,
      features: ['Authentication Form', 'Dark mode'],
      openInVsCode: false,
    },
    { sessionId: 'test', command: 'create signin app', confirmed: true }
  );

  assert.equal(scaffoldRes.success, true);
  const createdProject = path.join(testDir, projectName);
  assert.ok(fs.existsSync(createdProject), 'Project directory must be created');
  assert.ok(fs.existsSync(path.join(createdProject, 'index.html')), 'index.html must exist');
  assert.ok(fs.existsSync(path.join(createdProject, 'README.md')), 'README.md must exist');

  // Verify and test tool
  const verifyRes = await defaultToolRegistry.executeTool(
    'coding.verify_and_test',
    { projectPath: createdProject },
    { sessionId: 'test', command: 'verify', confirmed: true }
  );
  assert.equal(verifyRes.success, true);

  // Clean up test files
  fs.rmSync(createdProject, { recursive: true, force: true });
});

test('OpenJarvis Agents: all 9 agents are registered and available in the orchestrator', () => {
  const orchestrator = new OpenJarvisOrchestrator();
  const agents = orchestrator.listAgents();
  assert.equal(agents.length, 9, 'All 9 agents must be present');

  const agentIds = agents.map((a) => a.id);
  assert.deepEqual(
    agentIds.sort(),
    ['browser', 'coding', 'computer', 'core', 'file', 'memory', 'system', 'voice', 'workflow'].sort()
  );
});

test('OpenJarvis WorkflowAgent: plans and executes multi-step DAG with dependencies', async () => {
  const wfAgent = new WorkflowAgent(defaultToolRegistry);

  const nodes: WorkflowDAGNode[] = [
    {
      id: 'step-1',
      agentId: 'system',
      title: 'Fetch telemetry',
      toolName: 'system.get_telemetry',
      dependsOn: [],
      status: 'pending',
      retries: 0,
      maxRetries: 2,
    },
    {
      id: 'step-2',
      agentId: 'memory',
      title: 'Save status fact',
      toolName: 'memory.save_fact',
      parameters: { key: 'last_test_run', value: 'completed_successfully' },
      dependsOn: ['step-1'],
      status: 'pending',
      retries: 0,
      maxRetries: 2,
    },
  ];

  const plan = wfAgent.createDAGPlan('Test System Workflow', nodes);
  assert.equal(plan.state, 'READY');

  const result = await wfAgent.executeDAG(plan, {
    sessionId: 'test-wf',
    command: 'run test workflow',
    confirmed: true,
  });

  assert.equal(result.state, 'COMPLETED');
  assert.equal(result.progressPercent, 100);
  assert.equal(result.completedNodeIds.length, 2);
});

test('OpenJarvis Learning: traceRecorder logs compute metrics, estimated energy, and Level 2 feedback', () => {
  const recorder = new OpenJarvisTraceRecorder();

  const trace = recorder.recordTrace({
    command: 'What is the system CPU load?',
    agentIds: ['system'],
    totalDurationMs: 14,
    tokensEstimated: 85,
    success: true,
    steps: [
      {
        stepId: 'step-1',
        agentId: 'system',
        title: 'Query telemetry',
        status: 'completed',
        verified: true,
        durationMs: 12,
      },
    ],
  });

  assert.ok(trace.traceId.startsWith('trc-'));
  assert.ok(trace.estimatedGFlops >= 0);
  assert.ok(trace.estimatedEnergyMWh >= 0);

  // Level 2 correction
  recorder.recordCorrection(trace.traceId, 'open spotify', 'intent.open_app', 'User wanted desktop client not web');
  assert.equal(trace.feedback, 'correction');
  assert.ok(trace.correctionDetail?.includes('intent.open_app'));

  const jsonl = recorder.exportTracesJsonl();
  assert.ok(jsonl.includes(trace.traceId));
});

test('OpenJarvis Orchestrator: decomposes commands and routes to appropriate agent(s)', async () => {
  const orchestrator = new OpenJarvisOrchestrator();

  // Test system routing
  const sysTurn = await orchestrator.processCommand('Check CPU and RAM usage', true);
  assert.ok(sysTurn.activeAgents.includes('system'));
  assert.ok(sysTurn.reply.includes('CPU:'));

  // Test media routing
  const mediaTurn = await orchestrator.processCommand('increase volume', true);
  assert.ok(mediaTurn.activeAgents.includes('computer'));
  assert.equal(mediaTurn.steps[0]?.toolName, 'computer.media_key');

  const volDownTurn = await orchestrator.processCommand('decrease volume', true);
  assert.ok(volDownTurn.activeAgents.includes('computer'));
  assert.equal(volDownTurn.steps[0]?.toolName, 'computer.media_key');

  // Test coding routing
  const codeTurn = await orchestrator.processCommand('scaffold a new python script named my_scraper', true);
  assert.ok(codeTurn.activeAgents.includes('coding'));
  assert.ok(codeTurn.reply.includes('my_scraper'));
});
