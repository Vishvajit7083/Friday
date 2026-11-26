import fs from 'fs';
import http from 'http';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  autoFixWebProjectFiles,
  type GeneratedProjectFile,
  validateWebCodeStatic,
} from '../../src/core/automation/codeTemplates.ts';
import { classifyTerminalCommandRisk, PermissionManager } from '../../src/core/automation/permissionAndSafety.ts';

const execFileAsync = promisify(execFile);

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export async function executeControlledTerminalCommand(params: {
  command: string;
  cwd: string;
  allowedFolders: string[];
  approvedExternalPaths?: string[];
  confirmed?: boolean;
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  risk: 'SAFE' | 'MODERATE' | 'HIGH';
  requiresConfirmation?: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  detail: string;
}> {
  const assessment = classifyTerminalCommandRisk(params.command);
  const resolvedCwd = path.resolve(params.cwd || process.cwd());

  if (!PermissionManager.isPathAuthorized(resolvedCwd, params.allowedFolders, params.approvedExternalPaths)) {
    return {
      ok: false,
      risk: 'HIGH',
      exitCode: -1,
      stdout: '',
      stderr: '',
      detail: `Working directory "${resolvedCwd}" is outside permitted folders.`,
    };
  }

  if (assessment.risk === 'HIGH' && !params.confirmed) {
    return {
      ok: false,
      risk: assessment.risk,
      requiresConfirmation: assessment.requiresConfirmation,
      exitCode: -1,
      stdout: '',
      stderr: '',
      detail: assessment.reason,
    };
  }

  if (!assessment.allowed && !params.confirmed) {
    return {
      ok: false,
      risk: assessment.risk,
      requiresConfirmation: assessment.requiresConfirmation,
      exitCode: -1,
      stdout: '',
      stderr: '',
      detail: assessment.reason,
    };
  }

  if (!assessment.binary) {
    return {
      ok: false,
      risk: 'HIGH',
      exitCode: -1,
      stdout: '',
      stderr: '',
      detail: 'Empty or unsafe terminal command cannot execute.',
    };
  }

  // On Windows, map dir -> cmd /c dir safely via execFile without arbitrary shell expansion
  const winCmdBuiltins = new Set(['dir', 'ver', 'echo']);
  const execBin =
    process.platform === 'win32' && winCmdBuiltins.has(assessment.binary)
      ? 'cmd.exe'
      : assessment.binary;
  const execArgs =
    process.platform === 'win32' && winCmdBuiltins.has(assessment.binary)
      ? ['/c', assessment.binary, ...assessment.args]
      : assessment.args;

  try {
    const { stdout, stderr } = await execFileAsync(execBin, execArgs, {
      cwd: resolvedCwd,
      timeout: params.timeoutMs ?? 12_000,
      maxBuffer: 512 * 1024,
      shell: false,
    });
    return {
      ok: true,
      risk: assessment.risk,
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      detail: `Executed "${assessment.binary}" cleanly (exit code 0).`,
    };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      risk: assessment.risk,
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stdout: (e.stdout || '').trim(),
      stderr: (e.stderr || e.message || '').trim(),
      detail: `Command failed (exit ${e.code ?? 1}): ${(e.stderr || e.message || '').slice(0, 220)}`,
    };
  }
}

export async function checkAndAutoFixProjectDirectory(params: {
  projectDir: string;
  autoFix?: boolean;
}): Promise<{
  ok: boolean;
  appliedFixes: string[];
  diagnostics: string[];
  detail: string;
}> {
  const resolved = path.resolve(params.projectDir);
  if (!fs.existsSync(resolved)) {
    return { ok: false, appliedFixes: [], diagnostics: ['Project directory does not exist.'], detail: 'Directory missing.' };
  }

  const entries = fs.readdirSync(resolved, { withFileTypes: true }).filter((e) => e.isFile());
  let files: GeneratedProjectFile[] = entries
    .filter((e) => /\.(html?|css|m?js)$/i.test(e.name))
    .map((e) => ({
      relativePath: e.name,
      content: fs.readFileSync(path.join(resolved, e.name), 'utf-8'),
    }));

  const appliedFixes: string[] = [];
  let check = validateWebCodeStatic(files);

  if (!check.valid && params.autoFix !== false) {
    const fixed = autoFixWebProjectFiles(files);
    if (fixed.appliedFixes.length > 0) {
      appliedFixes.push(...fixed.appliedFixes);
      for (const f of fixed.fixedFiles) {
        fs.writeFileSync(path.join(resolved, f.relativePath), f.content, 'utf-8');
      }
      files = fixed.fixedFiles;
      check = validateWebCodeStatic(files);
    }
  }

  // Also run real Node.js syntax check (`node --check`) on .js/.mjs files
  for (const f of files.filter((x) => /\.m?js$/i.test(x.relativePath))) {
    try {
      await execFileAsync(process.execPath, ['--check', path.join(resolved, f.relativePath)], {
        timeout: 4000,
        shell: false,
      });
    } catch (err) {
      check.valid = false;
      check.diagnostics.push({
        file: f.relativePath,
        severity: 'error',
        message: (err as Error).message,
        fixable: false,
      });
    }
  }

  const diagStrings = check.diagnostics.map((d) => `${d.file}: ${d.message}`);
  return {
    ok: check.valid,
    appliedFixes,
    diagnostics: diagStrings,
    detail: check.valid
      ? `Validated ${files.length} web project file(s) with 0 syntax errors${
          appliedFixes.length ? ` (auto-fixed ${appliedFixes.length} issue(s))` : ''
        }.`
      : `Validation found ${diagStrings.length} error(s): ${diagStrings.join('; ')}`,
  };
}

export async function verifyWebProjectHttpPreview(projectDir: string): Promise<{
  ok: boolean;
  httpStatus: number;
  body: string;
  detail: string;
}> {
  const resolved = path.resolve(projectDir);
  if (!fs.existsSync(path.join(resolved, 'index.html'))) {
    return { ok: false, httpStatus: 0, body: '', detail: `No index.html found in "${resolved}".` };
  }

  const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    const candidate = path.resolve(resolved, rel);
    if (!candidate.startsWith(resolved + path.sep) && candidate !== path.join(resolved, 'index.html')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(candidate).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' });
    fs.createReadStream(candidate).pipe(res);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(4000) });
    const body = await response.text();
    const ok = response.ok && /<html/i.test(body) && body.trim().length > 40;
    return {
      ok,
      httpStatus: response.status,
      body,
      detail: ok
        ? `Live HTTP ${response.status} preview verified for "${path.basename(resolved)}" (${body.length} bytes rendered).`
        : `Preview server returned HTTP ${response.status}.`,
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      body: '',
      detail: `Preview verification error: ${(err as Error).message}`,
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
