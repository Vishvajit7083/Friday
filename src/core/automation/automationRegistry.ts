import type { AutomationPluginDescriptor, AutomationPluginId } from './types';

export const BUILTIN_AUTOMATION_PLUGINS: AutomationPluginDescriptor[] = [
  {
    id: 'youtube_automation',
    name: 'YouTubeAutomation',
    category: 'browser',
    description: 'Search YouTube, resolve playable watch URLs, open player, and control playback safely.',
    supportedWorkflows: ['youtube_search_play', 'youtube_playback_control'],
    triggers: ['youtube', 'play music', 'lofi', 'next video', 'pause video', 'gana chala'],
    requiredPermissions: ['browser_launch', 'media_keys'],
    riskDefault: 'low',
    enabled: true,
  },
  {
    id: 'vscode_automation',
    name: 'VSCodeAutomation',
    category: 'development',
    description: 'Open project folders in VS Code, scaffold multi-file apps, run syntax checks, and verify preview.',
    supportedWorkflows: ['vscode_login_website', 'vscode_project_scaffold', 'code_test_fix'],
    triggers: ['vscode', 'vs code', 'login page', 'website bana', 'web project'],
    requiredPermissions: ['app_launch', 'authorized_file_write', 'local_preview_server'],
    riskDefault: 'medium',
    enabled: true,
  },
  {
    id: 'browser_automation',
    name: 'BrowserAutomation',
    category: 'browser',
    description: 'Open Chrome/Edge, perform web searches, read public pages, and extract structured research.',
    supportedWorkflows: ['browser_research', 'open_website'],
    triggers: ['chrome', 'edge', 'browser', 'search', 'research', 'website kholo'],
    requiredPermissions: ['browser_launch', 'public_web_fetch'],
    riskDefault: 'low',
    enabled: true,
  },
  {
    id: 'file_automation',
    name: 'FileAutomation',
    category: 'files',
    description: 'Create folders/files, search across permitted directories, copy, rename, organize, and gated delete.',
    supportedWorkflows: ['file_organize', 'folder_create', 'file_copy', 'file_move', 'file_delete'],
    triggers: ['folder', 'file', 'organize', 'copy', 'move', 'delete', 'find file'],
    requiredPermissions: ['authorized_file_read', 'authorized_file_write'],
    riskDefault: 'medium',
    enabled: true,
  },
  {
    id: 'windows_automation',
    name: 'WindowsAutomation',
    category: 'system',
    description: 'Launch/focus/minimize/maximize Windows apps, inspect UIA trees, and read screen text/OCR.',
    supportedWorkflows: ['window_manage', 'app_launch', 'screen_inspect'],
    triggers: ['window', 'minimize', 'maximize', 'switch to', 'screen', 'ocr'],
    requiredPermissions: ['desktop_window_control'],
    riskDefault: 'low',
    enabled: true,
  },
  {
    id: 'word_automation',
    name: 'WordAutomation',
    category: 'office',
    description: 'Generate verified Microsoft Word (.docx) documents with headings, paragraphs, tables, and COM/viewer launch.',
    supportedWorkflows: ['word_report_create', 'research_to_word'],
    triggers: ['word', 'docx', 'document', 'report bana'],
    requiredPermissions: ['authorized_file_write'],
    riskDefault: 'medium',
    enabled: true,
  },
  {
    id: 'excel_automation',
    name: 'ExcelAutomation',
    category: 'office',
    description: 'Create verified Microsoft Excel (.xlsx) workbooks with multiple sheets, tables, and live =SUM formulas.',
    supportedWorkflows: ['excel_expense_tracker', 'excel_sheet_create'],
    triggers: ['excel', 'xlsx', 'spreadsheet', 'expense sheet', 'monthly expenses'],
    requiredPermissions: ['authorized_file_write'],
    riskDefault: 'medium',
    enabled: true,
  },
  {
    id: 'powerpoint_automation',
    name: 'PowerPointAutomation',
    category: 'office',
    description: 'Create verified Microsoft PowerPoint (.pptx) multi-slide decks with structured titles and bullet points.',
    supportedWorkflows: ['powerpoint_deck_create'],
    triggers: ['powerpoint', 'pptx', 'ppt', 'presentation', 'slides'],
    requiredPermissions: ['authorized_file_write'],
    riskDefault: 'medium',
    enabled: true,
  },
  {
    id: 'terminal_automation',
    name: 'TerminalAutomation',
    category: 'system',
    description: 'Execute SAFE/MODERATE CLI commands via execFile without shell injection and gate HIGH risk commands.',
    supportedWorkflows: ['terminal_command_run'],
    triggers: ['terminal', 'cmd', 'powershell', 'run command', 'npm test', 'git status'],
    requiredPermissions: ['terminal_exec'],
    riskDefault: 'high',
    enabled: true,
  },
  {
    id: 'notepad_automation',
    name: 'NotepadAutomation',
    category: 'development',
    description: 'Write C, C++, Python, or text files cleanly and open them in Notepad or Notepad++.',
    supportedWorkflows: ['notepad_code_write'],
    triggers: ['notepad', 'c program', 'hello world', 'text file'],
    requiredPermissions: ['authorized_file_write', 'app_launch'],
    riskDefault: 'medium',
    enabled: true,
  },
  {
    id: 'media_automation',
    name: 'MediaAutomation',
    category: 'media',
    description: 'Control system audio/video playback (play/pause, next, previous, volume up/down, mute).',
    supportedWorkflows: ['media_key_control'],
    triggers: ['volume', 'mute', 'pause', 'resume', 'next track', 'awaz'],
    requiredPermissions: ['media_keys'],
    riskDefault: 'low',
    enabled: true,
  },
];

export class AutomationRegistry {
  private plugins = new Map<AutomationPluginId, AutomationPluginDescriptor>();

  constructor(initial: AutomationPluginDescriptor[] = BUILTIN_AUTOMATION_PLUGINS) {
    for (const plugin of initial) {
      this.plugins.set(plugin.id, plugin);
    }
  }

  registerPlugin(plugin: AutomationPluginDescriptor): void {
    this.plugins.set(plugin.id, plugin);
  }

  getPlugin(id: AutomationPluginId): AutomationPluginDescriptor | undefined {
    return this.plugins.get(id);
  }

  listPlugins(): AutomationPluginDescriptor[] {
    return Array.from(this.plugins.values());
  }

  setEnabled(id: AutomationPluginId, enabled: boolean): boolean {
    const existing = this.plugins.get(id);
    if (!existing) return false;
    this.plugins.set(id, { ...existing, enabled });
    return true;
  }

  findMatchingPlugins(goalText: string): AutomationPluginDescriptor[] {
    const lower = goalText.toLowerCase();
    return this.listPlugins().filter(
      (p) => p.enabled && p.triggers.some((t) => lower.includes(t.toLowerCase()))
    );
  }
}
