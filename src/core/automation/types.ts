import type { AgentId, GroundingSource } from '../types';

export type WorkflowTaskState =
  | 'pending'
  | 'planning'
  | 'waiting_for_user'
  | 'running'
  | 'paused'
  | 'failed'
  | 'retrying'
  | 'verifying'
  | 'completed'
  | 'cancelled';

export type WorkflowRiskLevel = 'low' | 'medium' | 'high';

export type TerminalRiskLevel = 'SAFE' | 'MODERATE' | 'HIGH';

export type AutomationPluginId =
  | 'youtube_automation'
  | 'vscode_automation'
  | 'browser_automation'
  | 'file_automation'
  | 'windows_automation'
  | 'word_automation'
  | 'excel_automation'
  | 'powerpoint_automation'
  | 'terminal_automation'
  | 'notepad_automation'
  | 'media_automation';

export type AutomationStepKind =
  | 'app_launch'
  | 'app_focus'
  | 'window_manage'
  | 'browser_open'
  | 'browser_research'
  | 'youtube_play'
  | 'youtube_control'
  | 'media_control'
  | 'folder_create'
  | 'file_write'
  | 'file_read'
  | 'file_search'
  | 'file_copy'
  | 'file_move'
  | 'file_delete'
  | 'file_organize'
  | 'code_scaffold'
  | 'code_syntax_check'
  | 'code_auto_fix'
  | 'code_preview_verify'
  | 'office_word_create'
  | 'office_excel_create'
  | 'office_powerpoint_create'
  | 'terminal_execute'
  | 'screen_inspect'
  | 'ui_interact'
  | 'workflow_memory_save';

export interface VerificationExpectation {
  type: 'file_exists' | 'ooxml_valid' | 'http_ok' | 'syntax_valid' | 'process_started' | 'window_or_url' | 'result_non_empty';
  target?: string;
  description: string;
}

export interface RecoveryStrategy {
  maxRetries: number;
  fallbackAction?: string;
  userHelpHint: string;
}

export interface WorkflowStepSpec {
  id: string;
  title: string;
  pluginId: AutomationPluginId;
  kind: AutomationStepKind;
  agent: AgentId;
  params: Record<string, unknown>;
  dependsOn: string[];
  parallelGroup?: string;
  risk: WorkflowRiskLevel;
  requiresConfirmation: boolean;
  verification: VerificationExpectation;
  recovery: RecoveryStrategy;
}

export interface WorkflowPlanSpec {
  id: string;
  goal: string;
  normalizedGoal: string;
  scenarioKey: string;
  language: 'english' | 'hinglish' | 'hindi';
  riskLevel: WorkflowRiskLevel;
  requiresConfirmation: boolean;
  confirmationReason?: string;
  targetPath?: string;
  usesPreferences: string[];
  steps: WorkflowStepSpec[];
  createdAt: string;
}

export interface WorkflowStepExecutionRecord {
  stepId: string;
  title: string;
  pluginId: AutomationPluginId;
  kind: AutomationStepKind;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'skipped' | 'cancelled';
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  output?: string;
  verified: boolean;
  verificationDetail?: string;
  error?: string;
  artifacts?: string[];
}

export interface BackgroundTaskRecord {
  id: string;
  goal: string;
  scenarioKey: string;
  state: WorkflowTaskState;
  riskLevel: WorkflowRiskLevel;
  requiresConfirmation: boolean;
  confirmed: boolean;
  confirmationSummary?: string;
  progressPercent: number;
  currentStepIndex: number;
  steps: WorkflowStepExecutionRecord[];
  plan: WorkflowPlanSpec;
  artifacts: string[];
  sources: GroundingSource[];
  logs: string[];
  summary?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AutomationPluginDescriptor {
  id: AutomationPluginId;
  name: string;
  category: 'browser' | 'development' | 'office' | 'system' | 'files' | 'media';
  description: string;
  supportedWorkflows: string[];
  triggers: string[];
  requiredPermissions: string[];
  riskDefault: WorkflowRiskLevel;
  enabled: boolean;
}

export interface ApplicationProfile {
  id: string;
  name: string;
  category: 'browser' | 'development' | 'office' | 'system' | 'media' | 'communication';
  exeNames: string[];
  aliases: string[];
  supportsCom?: boolean;
  fallbackIds: string[];
  capabilities: string[];
}

export interface WorkflowPreferenceItem {
  key: string;
  label: string;
  value: string;
  category: 'folder' | 'browser' | 'editor' | 'office' | 'workflow';
  updatedAt: string;
}

export interface TerminalCommandAssessment {
  command: string;
  binary: string;
  args: string[];
  risk: TerminalRiskLevel;
  allowed: boolean;
  requiresConfirmation: boolean;
  reason: string;
}

export interface ScreenElementInfo {
  name: string;
  automationId?: string;
  controlType: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface ComputerAction {
  type: 'focus_window' | 'click_element' | 'type_text' | 'hotkey' | 'mouse_click' | 'read_screen';
  targetApp?: string;
  elementName?: string;
  text?: string;
  keys?: string;
  x?: number;
  y?: number;
}

export interface PermissionDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  risk: WorkflowRiskLevel;
  reason: string;
  blockedByPolicy?: boolean;
}
