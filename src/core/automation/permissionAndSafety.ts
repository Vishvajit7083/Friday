import path from 'path';
import os from 'os';
import type {
  PermissionDecision,
  TerminalCommandAssessment,
  TerminalRiskLevel,
  WorkflowRiskLevel,
} from './types';

const SAFE_TERMINAL_COMMANDS = new Set([
  'dir',
  'ls',
  'pwd',
  'cd',
  'echo',
  'node',
  'npm',
  'npx',
  'tsc',
  'python',
  'python3',
  'py',
  'git',
  'where',
  'which',
  'whoami',
  'hostname',
  'date',
  'ver',
  'systeminfo',
  'gcc',
  'g++',
  'javac',
  'java',
]);

const MODERATE_TERMINAL_COMMANDS = new Set([
  'mkdir',
  'md',
  'copy',
  'cp',
  'move',
  'mv',
  'ren',
  'rename',
  'touch',
  'pip',
  'pip3',
  'bun',
  'code',
]);

const HIGH_RISK_PATTERNS: RegExp[] = [
  /\b(rm\s+-rf|rmdir\s+\/s|del\s+\/[fqsa]|erase\s+\/[fqsa]|format\b|diskpart\b|bcdedit\b|shutdown\b|restart\b|reboot\b)\b/i,
  /\b(reg\s+delete|reg\s+add|net\s+user|icacls\b|takeown\b|sc\s+delete|taskkill\s+\/f|stop-process\b)\b/i,
  /\b(invoke-expression|iex\b|curl\b.*\|\s*(sh|bash|pwsh|powershell)|wget\b.*\|\s*(sh|bash))\b/i,
  /\b(set-executionpolicy|disable-windowsdefender|netsh\s+advfirewall\s+set\s+allprofiles\s+state\s+off)\b/i,
];

const STRICT_PROHIBITED_PATTERNS: RegExp[] = [
  /\b(bypass\s+captcha|solve\s+captcha|crack\s+password|disable\s+(?:antivirus|defender|firewall|security))\b/i,
  /\b(submit\s+(?:payment|credit\s*card|bank|otp|password)|auto[- ]?buy|checkout\s+payment)\b/i,
];

const SHELL_METACHAR_PATTERN = /[;&|`$<>]/;

export function tokenizeCommandSafe(rawCommand: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < rawCommand.length; i += 1) {
    const ch = rawCommand[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

export function classifyTerminalCommandRisk(rawCommand: string): TerminalCommandAssessment {
  const trimmed = rawCommand.trim();
  if (!trimmed) {
    return {
      command: rawCommand,
      binary: '',
      args: [],
      risk: 'HIGH',
      allowed: false,
      requiresConfirmation: false,
      reason: 'Empty command is not allowed.',
    };
  }

  for (const rx of STRICT_PROHIBITED_PATTERNS) {
    if (rx.test(trimmed)) {
      return {
        command: trimmed,
        binary: '',
        args: [],
        risk: 'HIGH',
        allowed: false,
        requiresConfirmation: false,
        reason: 'Blocked by F.R.I.D.A.Y. Safety Policy (security bypass / credential / financial restriction).',
      };
    }
  }

  if (SHELL_METACHAR_PATTERN.test(trimmed)) {
    return {
      command: trimmed,
      binary: '',
      args: [],
      risk: 'HIGH',
      allowed: false,
      requiresConfirmation: true,
      reason: 'Chained shell operators (;, &, |, >, <, `) require explicit decomposition or confirmation.',
    };
  }

  for (const rx of HIGH_RISK_PATTERNS) {
    if (rx.test(trimmed)) {
      const tokens = tokenizeCommandSafe(trimmed);
      return {
        command: trimmed,
        binary: (tokens[0] || '').toLowerCase(),
        args: tokens.slice(1),
        risk: 'HIGH',
        allowed: false,
        requiresConfirmation: true,
        reason: 'Destructive or system-level terminal command classified as HIGH risk and gated for explicit confirmation.',
      };
    }
  }

  const tokens = tokenizeCommandSafe(trimmed);
  const rawBin = tokens[0] || '';
  const binary = path.basename(rawBin).toLowerCase().replace(/\.(exe|cmd|bat)$/i, '');
  const args = tokens.slice(1);

  if (binary === 'npm' || binary === 'npx') {
    const sub = (args[0] || '').toLowerCase();
    const safeSubs = new Set(['test', 'run', 'run-script', 'install', 'ci', 'list', '-v', '--version', 'audit']);
    const risk: TerminalRiskLevel =
      sub === 'install' || sub === 'i' || sub === 'uninstall' || sub === 'publish' ? 'MODERATE' : 'SAFE';
    if (!safeSubs.has(sub) && !sub.startsWith('check') && !sub.startsWith('build')) {
      return {
        command: trimmed,
        binary,
        args,
        risk: 'MODERATE',
        allowed: true,
        requiresConfirmation: sub === 'publish' || sub === 'uninstall',
        reason: `npm ${sub || 'command'} classified as MODERATE.`,
      };
    }
    return {
      command: trimmed,
      binary,
      args,
      risk,
      allowed: true,
      requiresConfirmation: false,
      reason: `Allowed npm ${sub} execution in workspace.`,
    };
  }

  if (binary === 'git') {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'push' || sub === 'reset' || sub === 'clean' || sub === 'rebase') {
      return {
        command: trimmed,
        binary,
        args,
        risk: 'HIGH',
        allowed: false,
        requiresConfirmation: true,
        reason: `git ${sub} mutates remote or working tree state and requires explicit confirmation.`,
      };
    }
    return {
      command: trimmed,
      binary,
      args,
      risk: 'SAFE',
      allowed: true,
      requiresConfirmation: false,
      reason: `Read-only/local git ${sub || 'status'} allowed.`,
    };
  }

  if (SAFE_TERMINAL_COMMANDS.has(binary)) {
    return {
      command: trimmed,
      binary,
      args,
      risk: 'SAFE',
      allowed: true,
      requiresConfirmation: false,
      reason: `Command "${binary}" is allowlisted as SAFE.`,
    };
  }

  if (MODERATE_TERMINAL_COMMANDS.has(binary)) {
    return {
      command: trimmed,
      binary,
      args,
      risk: 'MODERATE',
      allowed: true,
      requiresConfirmation: false,
      reason: `Command "${binary}" is classified as MODERATE within authorized folders.`,
    };
  }

  return {
    command: trimmed,
    binary,
    args,
    risk: 'HIGH',
    allowed: false,
    requiresConfirmation: true,
    reason: `Unrecognized executable "${binary}" requires explicit user confirmation before running.`,
  };
}

export class SafetyManager {
  static checkGoalPolicy(goal: string): { allowed: boolean; reason?: string } {
    for (const rx of STRICT_PROHIBITED_PATTERNS) {
      if (rx.test(goal)) {
        return {
          allowed: false,
          reason:
            'Safety policy prevents bypassing CAPTCHAs, disabling security software, submitting payments, or automating sensitive credential logins.',
        };
      }
    }
    return { allowed: true };
  }

  static assessActionRisk(
    actionKind: string,
    targetPath?: string,
    hasOverwriteOrDelete = false
  ): WorkflowRiskLevel {
    if (
      actionKind === 'file_delete' ||
      actionKind === 'terminal_execute' ||
      hasOverwriteOrDelete
    ) {
      return 'high';
    }
    if (
      actionKind === 'file_move' ||
      actionKind === 'file_organize' ||
      actionKind === 'file_write' ||
      actionKind === 'folder_create' ||
      actionKind === 'code_scaffold' ||
      actionKind === 'office_word_create' ||
      actionKind === 'office_excel_create' ||
      actionKind === 'office_powerpoint_create'
    ) {
      if (targetPath && /[a-zA-Z]:\\/.test(targetPath) && process.platform !== 'win32') {
        return 'medium';
      }
      return 'medium';
    }
    return 'low';
  }
}

export class PermissionManager {
  static isWindowsDrivePath(target: string): boolean {
    return /^[a-zA-Z]:\\/.test(target.trim());
  }

  static isPathAuthorized(
    targetPath: string,
    allowedFolders: string[],
    approvedExternalPaths: string[] = []
  ): boolean {
    if (!targetPath || targetPath.includes('\0')) return false;

    const normalizedTarget = path.resolve(targetPath);
    const home = os.homedir();
    const candidates = [
      ...allowedFolders.map((f) => path.resolve(f)),
      ...approvedExternalPaths.map((f) => path.resolve(f)),
      path.resolve(process.cwd()),
      path.join(home, 'Documents'),
      path.join(home, 'Downloads'),
      path.join(home, 'Desktop'),
    ];

    for (const root of candidates) {
      if (normalizedTarget === root || normalizedTarget.startsWith(root + path.sep)) {
        return true;
      }
    }

    // Check explicit Windows drive path case-insensitively on Windows
    if (process.platform === 'win32') {
      const lowerTarget = normalizedTarget.toLowerCase();
      for (const root of candidates) {
        const lowerRoot = root.toLowerCase();
        if (lowerTarget === lowerRoot || lowerTarget.startsWith(lowerRoot + '\\')) {
          return true;
        }
      }
    }

    return false;
  }

  static evaluateFileOperation(params: {
    operation: 'read' | 'create_folder' | 'write' | 'overwrite' | 'copy' | 'move' | 'delete' | 'organize';
    targetPath: string;
    allowedFolders: string[];
    approvedExternalPaths?: string[];
    explicitlyConfirmed?: boolean;
  }): PermissionDecision {
    const authorized = PermissionManager.isPathAuthorized(
      params.targetPath,
      params.allowedFolders,
      params.approvedExternalPaths || []
    );

    if (params.operation === 'delete') {
      return {
        allowed: Boolean(params.explicitlyConfirmed) && authorized,
        requiresConfirmation: !params.explicitlyConfirmed,
        risk: 'high',
        reason: authorized
          ? 'File deletion is destructive and requires explicit user confirmation.'
          : `Path "${params.targetPath}" is outside authorized directories.`,
        blockedByPolicy: !authorized,
      };
    }

    if (params.operation === 'overwrite' || params.operation === 'move' || params.operation === 'organize') {
      if (!authorized && !params.explicitlyConfirmed) {
        return {
          allowed: false,
          requiresConfirmation: true,
          risk: 'high',
          reason: `Target "${params.targetPath}" is outside currently permitted folders and requires approval.`,
        };
      }
      return {
        allowed: true,
        requiresConfirmation: params.operation === 'overwrite' && !params.explicitlyConfirmed,
        risk: 'medium',
        reason: 'Authorized with reversible staging backup.',
      };
    }

    if (!authorized) {
      return {
        allowed: Boolean(params.explicitlyConfirmed),
        requiresConfirmation: !params.explicitlyConfirmed,
        risk: 'medium',
        reason: `Destination "${params.targetPath}" is outside default permitted folders. Approve once to allow workspace creation here.`,
      };
    }

    return {
      allowed: true,
      requiresConfirmation: false,
      risk: params.operation === 'read' ? 'low' : 'medium',
      reason: 'Permitted inside authorized workspace directory.',
    };
  }
}
