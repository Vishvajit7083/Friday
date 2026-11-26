import fs from 'fs';
import path from 'path';
import { PermissionManager } from '../../src/core/automation/permissionAndSafety.ts';
import { invalidateFileIndexCache } from '../fileService.ts';

function stageBackupBeforeMutate(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return null;
  const backupDir = path.resolve(process.cwd(), '.friday-backup');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${Date.now()}-${path.basename(filePath)}`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

export class AutomationFileManager {
  static createFolder(params: {
    folderPath: string;
    allowedFolders: string[];
    approvedExternalPaths?: string[];
    confirmed?: boolean;
  }): { ok: boolean; path: string; detail: string; requiresConfirmation?: boolean } {
    const decision = PermissionManager.evaluateFileOperation({
      operation: 'create_folder',
      targetPath: params.folderPath,
      allowedFolders: params.allowedFolders,
      approvedExternalPaths: params.approvedExternalPaths,
      explicitlyConfirmed: params.confirmed,
    });

    if (!decision.allowed) {
      return {
        ok: false,
        path: params.folderPath,
        detail: decision.reason,
        requiresConfirmation: decision.requiresConfirmation,
      };
    }

    if (PermissionManager.isWindowsDrivePath(params.folderPath) && process.platform !== 'win32') {
      return {
        ok: false,
        path: params.folderPath,
        detail: `Windows drive path "${params.folderPath}" can only be created when F.R.I.D.A.Y. is running on a Windows host.`,
      };
    }

    const resolved = path.resolve(params.folderPath);
    fs.mkdirSync(resolved, { recursive: true });
    invalidateFileIndexCache();
    return {
      ok: fs.existsSync(resolved) && fs.statSync(resolved).isDirectory(),
      path: resolved,
      detail: `Created directory "${resolved}".`,
    };
  }

  static writeFileSafe(params: {
    filePath: string;
    content: string | Buffer;
    allowedFolders: string[];
    approvedExternalPaths?: string[];
    confirmed?: boolean;
  }): {
    ok: boolean;
    path: string;
    sizeBytes: number;
    backupPath?: string | null;
    detail: string;
    requiresConfirmation?: boolean;
  } {
    const resolved = path.resolve(params.filePath);
    const exists = fs.existsSync(resolved);
    const decision = PermissionManager.evaluateFileOperation({
      operation: exists ? 'overwrite' : 'write',
      targetPath: resolved,
      allowedFolders: params.allowedFolders,
      approvedExternalPaths: params.approvedExternalPaths,
      explicitlyConfirmed: params.confirmed,
    });

    if (!decision.allowed) {
      return {
        ok: false,
        path: resolved,
        sizeBytes: 0,
        detail: decision.reason,
        requiresConfirmation: decision.requiresConfirmation,
      };
    }

    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const backupPath = exists ? stageBackupBeforeMutate(resolved) : null;
    fs.writeFileSync(resolved, params.content);
    invalidateFileIndexCache();
    const sizeBytes = fs.statSync(resolved).size;
    return {
      ok: true,
      path: resolved,
      sizeBytes,
      backupPath,
      detail: `Saved file "${resolved}" (${sizeBytes} bytes)${backupPath ? ` (backup staged at ${backupPath})` : ''}.`,
    };
  }

  static copyFileSafe(params: {
    srcPath: string;
    destPath: string;
    allowedFolders: string[];
    approvedExternalPaths?: string[];
    confirmed?: boolean;
  }): { ok: boolean; destPath: string; detail: string; requiresConfirmation?: boolean } {
    const src = path.resolve(params.srcPath);
    const dest = path.resolve(params.destPath);
    if (!fs.existsSync(src)) {
      return { ok: false, destPath: dest, detail: `Source file "${src}" does not exist.` };
    }
    const readPerm = PermissionManager.evaluateFileOperation({
      operation: 'read',
      targetPath: src,
      allowedFolders: params.allowedFolders,
      approvedExternalPaths: params.approvedExternalPaths,
      explicitlyConfirmed: params.confirmed,
    });
    const writePerm = PermissionManager.evaluateFileOperation({
      operation: fs.existsSync(dest) ? 'overwrite' : 'copy',
      targetPath: dest,
      allowedFolders: params.allowedFolders,
      approvedExternalPaths: params.approvedExternalPaths,
      explicitlyConfirmed: params.confirmed,
    });
    if (!readPerm.allowed || !writePerm.allowed) {
      return {
        ok: false,
        destPath: dest,
        detail: !readPerm.allowed ? readPerm.reason : writePerm.reason,
        requiresConfirmation: writePerm.requiresConfirmation,
      };
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    invalidateFileIndexCache();
    return { ok: true, destPath: dest, detail: `Copied "${src}" -> "${dest}".` };
  }

  static deleteFileSafe(params: {
    targetPath: string;
    allowedFolders: string[];
    approvedExternalPaths?: string[];
    confirmed: boolean;
  }): { ok: boolean; backupPath?: string | null; detail: string; requiresConfirmation?: boolean } {
    const resolved = path.resolve(params.targetPath);
    const decision = PermissionManager.evaluateFileOperation({
      operation: 'delete',
      targetPath: resolved,
      allowedFolders: params.allowedFolders,
      approvedExternalPaths: params.approvedExternalPaths,
      explicitlyConfirmed: params.confirmed,
    });
    if (!decision.allowed) {
      return {
        ok: false,
        detail: decision.reason,
        requiresConfirmation: decision.requiresConfirmation,
      };
    }
    if (!fs.existsSync(resolved)) {
      return { ok: false, detail: `Target "${resolved}" does not exist.` };
    }
    const backupPath = stageBackupBeforeMutate(resolved);
    fs.rmSync(resolved, { recursive: false, force: false });
    invalidateFileIndexCache();
    return {
      ok: true,
      backupPath,
      detail: `Deleted "${resolved}"${backupPath ? ` (reversible backup saved at ${backupPath})` : ''}.`,
    };
  }

  static organizeDirectory(params: {
    folderPath: string;
    allowedFolders: string[];
    approvedExternalPaths?: string[];
    dryRun: boolean;
  }): { ok: boolean; movedCount: number; plan: Array<{ file: string; targetFolder: string }>; detail: string } {
    const resolved = path.resolve(params.folderPath);
    if (!PermissionManager.isPathAuthorized(resolved, params.allowedFolders, params.approvedExternalPaths)) {
      return {
        ok: false,
        movedCount: 0,
        plan: [],
        detail: `Folder "${resolved}" is outside authorized directories.`,
      };
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return { ok: false, movedCount: 0, plan: [], detail: `Folder "${resolved}" not found.` };
    }

    const extBucket = (ext: string): string => {
      const e = ext.toLowerCase();
      if (['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'].includes(e)) return 'Documents';
      if (['.xls', '.xlsx', '.csv'].includes(e)) return 'Spreadsheets';
      if (['.ppt', '.pptx'].includes(e)) return 'Presentations';
      if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(e)) return 'Images';
      if (['.mp4', '.mkv', '.mov', '.webm'].includes(e)) return 'Videos';
      if (['.mp3', '.wav', '.flac', '.m4a'].includes(e)) return 'Audio';
      if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(e)) return 'Archives';
      if (['.ts', '.tsx', '.js', '.jsx', '.py', '.c', '.cpp', '.html', '.css', '.json'].includes(e)) return 'Code';
      return 'Other';
    };

    const entries = fs.readdirSync(resolved, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith('.'));
    const plan = entries.map((e) => ({
      file: e.name,
      targetFolder: extBucket(path.extname(e.name)),
    }));

    if (params.dryRun) {
      return {
        ok: true,
        movedCount: 0,
        plan,
        detail: `Dry-run planned organization for ${plan.length} file(s) in "${resolved}".`,
      };
    }

    let movedCount = 0;
    for (const item of plan) {
      const destDir = path.join(resolved, item.targetFolder);
      fs.mkdirSync(destDir, { recursive: true });
      const src = path.join(resolved, item.file);
      const dest = path.join(destDir, item.file);
      if (!fs.existsSync(dest)) {
        fs.renameSync(src, dest);
        movedCount += 1;
      }
    }
    invalidateFileIndexCache();
    return {
      ok: true,
      movedCount,
      plan,
      detail: `Organized ${movedCount} file(s) inside "${resolved}" into category folders.`,
    };
  }
}
