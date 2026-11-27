export type OpenJarvisAgentId =
  | 'core'
  | 'computer'
  | 'file'
  | 'coding'
  | 'browser'
  | 'voice'
  | 'system'
  | 'memory'
  | 'workflow';

export type ModelTier = 'ultra_light' | 'light' | 'standard' | 'heavy';

export interface HardwareProfile {
  cpuModel: string;
  architecture: string;
  logicalCores: number;
  physicalCores: number;
  totalRamMb: number;
  freeRamMb: number;
  gpuName: string;
  vramMb: number;
  hasAvx2: boolean;
  hasAvx512: boolean;
  hasNeon: boolean;
  hasFp16: boolean;
  platform: 'win32' | 'linux' | 'darwin';
  recommendedTier: ModelTier;
  recommendedModelId: string;
}

export type ModelProviderType = 'local_builtin' | 'gguf' | 'onnx';

export interface ModelCatalogItem {
  id: string;
  name: string;
  provider: ModelProviderType;
  format: 'builtin' | 'gguf' | 'onnx';
  description: string;
  parameterCount: string;
  quantization: string;
  memoryRequirementMb: number;
  contextLength: number;
  downloadUrl?: string;
  downloaded: boolean;
  localPath?: string;
  recommendedForHardware: boolean;
  status: 'ready' | 'downloadable' | 'downloading' | 'failed';
  sizeBytes?: number;
}

export interface AgentContext {
  sessionId: string;
  command: string;
  confirmed: boolean;
  userId?: string;
  hardwareProfile?: HardwareProfile;
  memory?: Record<string, unknown>;
  workingDir?: string;
  environment?: Record<string, string>;
  traceId?: string;
}

export interface AgentPlanStep {
  id: string;
  agentId: OpenJarvisAgentId;
  title: string;
  toolName?: string;
  parameters?: Record<string, unknown>;
  dependencies?: string[];
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
}

export interface StepExecutionResult {
  stepId: string;
  agentId: OpenJarvisAgentId;
  title: string;
  toolName?: string;
  status: 'completed' | 'failed' | 'cancelled' | 'pending_confirmation';
  output?: unknown;
  error?: string;
  verified: boolean;
  detail?: string;
  artifacts?: string[];
  durationMs: number;
}

export interface VerificationResult {
  passed: boolean;
  reason?: string;
  retryRecommended?: boolean;
  suggestedFix?: string;
}

export interface ReflectionResult {
  lessonsLearned: string[];
  intentCorrections?: {
    originalIntent: string;
    suggestedIntent: string;
    confidence: number;
  }[];
}

export type WorkflowState =
  | 'CREATED'
  | 'PLANNING'
  | 'READY'
  | 'RUNNING'
  | 'WAITING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface WorkflowDAGNode {
  id: string;
  agentId: OpenJarvisAgentId;
  title: string;
  toolName?: string;
  parameters?: Record<string, unknown>;
  dependsOn: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';
  retries: number;
  maxRetries: number;
  output?: unknown;
  error?: string;
  artifacts?: string[];
  durationMs?: number;
}

export interface WorkflowExecutionPlan {
  id: string;
  goal: string;
  state: WorkflowState;
  createdAt: string;
  nodes: WorkflowDAGNode[];
  progressPercent: number;
  requiresConfirmation: boolean;
  confirmationSummary?: string;
  activeNodeId?: string;
  completedNodeIds: string[];
  artifacts: string[];
}

export type ToolPermissionLevel = 'safe' | 'requires_confirmation';

export interface ToolExecutionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  detail?: string;
  artifacts?: string[];
}

export interface OpenJarvisTool {
  name: string;
  description: string;
  agentId: OpenJarvisAgentId;
  permission: ToolPermissionLevel;
  parametersSchema: Record<string, unknown>;
  execute: (params: any, context: AgentContext) => Promise<ToolExecutionResponse>;
}

export interface ExecutionTrace {
  traceId: string;
  timestamp: string;
  command: string;
  agentIds: OpenJarvisAgentId[];
  totalDurationMs: number;
  tokensEstimated: number;
  estimatedGFlops: number;
  estimatedEnergyMWh: number;
  success: boolean;
  steps: StepExecutionResult[];
  feedback?: 'positive' | 'negative' | 'correction';
  correctionDetail?: string;
}

export interface CodingProjectConfig {
  projectType: 'react_ts' | 'python_script' | 'node_express' | 'vanilla_web' | 'cli_tool';
  projectName: string;
  targetDirectory?: string;
  features: string[];
  openInVsCode?: boolean;
  runTestsAfter?: boolean;
}

export interface CodingProjectResult {
  projectPath: string;
  createdFiles: string[];
  verified: boolean;
  testOutput?: string;
  vsCodeOpened?: boolean;
  errors?: string[];
}
