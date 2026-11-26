import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-auto-test-'));
const tempDataDir = path.join(tempRoot, 'data');
const tempWorkDir = path.join(tempRoot, 'workspace');
fs.mkdirSync(tempDataDir, { recursive: true });
fs.mkdirSync(tempWorkDir, { recursive: true });
process.env.FRIDAY_DATA_DIR = tempDataDir;

import {
  ApplicationManager,
  AutomationBrain,
  AutomationRegistry,
  BUILTIN_AUTOMATION_PLUGINS,
  ErrorRecoveryEngine,
  PermissionManager,
  SafetyManager,
  TaskVerificationEngine,
  WorkflowPlanner,
  autoFixWebProjectFiles,
  buildLoginWebsiteProject,
  classifyTerminalCommandRisk,
  validateWebCodeStatic,
} from './index';
import {
  buildDocxBuffer,
  buildPptxBuffer,
  buildXlsxBuffer,
  verifyOoxmlZipBuffer,
  writeAndVerifyOfficeFile,
} from '../../../server/automation/ooxmlBuilder';
import {
  checkAndAutoFixProjectDirectory,
  executeControlledTerminalCommand,
  verifyWebProjectHttpPreview,
} from '../../../server/automation/codeExecutor';
import { AutomationFileManager } from '../../../server/automation/fileManager';
import { automationTaskManager } from '../../../server/automation/workflowExecutor';
import {
  deleteWorkflowPreference,
  listBackgroundTaskRecords,
  listWorkflowPreferences,
  saveWorkflowPreference,
} from '../../../server/cognitiveDb';
import { loadDb, saveDb } from '../../../server/store';

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('AutomationRegistry registers all 11 plugins and supports enable/disable toggles', () => {
  const reg = new AutomationRegistry();
  assert.equal(BUILTIN_AUTOMATION_PLUGINS.length, 11);
  assert.equal(reg.listPlugins().length, 11);
  assert.ok(reg.getPlugin('youtube_automation'));
  assert.ok(reg.getPlugin('vscode_automation'));
  assert.ok(reg.getPlugin('word_automation'));
  assert.ok(reg.getPlugin('excel_automation'));
  assert.ok(reg.getPlugin('powerpoint_automation'));

  const okDisable = reg.setEnabled('youtube_automation', false);
  assert.equal(okDisable, true);
  assert.equal(reg.getPlugin('youtube_automation')?.enabled, false);
  reg.setEnabled('youtube_automation', true);
  assert.equal(reg.getPlugin('youtube_automation')?.enabled, true);
});

test('ApplicationManager resolves app profiles, aliases, and fallback chains', () => {
  const mgr = new ApplicationManager();
  assert.equal(mgr.resolveProfile('VS Code')?.id, 'code');
  assert.equal(mgr.resolveProfile('word')?.id, 'winword');
  assert.equal(mgr.resolveProfile('excel')?.id, 'excel');
  assert.equal(mgr.resolveProfile('powerpoint')?.id, 'powerpnt');

  const chain = mgr.getFallbackChain('chrome');
  assert.equal(chain[0]?.id, 'chrome');
  assert.ok(chain.some((f) => f.id === 'edge'));
});

test('WorkflowPlanner plans Hinglish/English goals, workflow controls, and WorkflowMemory defaults', () => {
  assert.equal(WorkflowPlanner.isWorkflowControlCommand('Pause current task'), 'pause');
  assert.equal(WorkflowPlanner.isWorkflowControlCommand('Resume workflow'), 'resume');
  assert.equal(WorkflowPlanner.isWorkflowControlCommand('Cancel task'), 'cancel');
  assert.equal(WorkflowPlanner.isWorkflowControlCommand('Task status batao'), 'status');

  assert.equal(WorkflowPlanner.isAutomationGoal('Friday chrome kholo aur youtube pe lofi music play kar'), true);
  assert.equal(WorkflowPlanner.isAutomationGoal('open chrome and play arjit song'), true);
  assert.equal(WorkflowPlanner.isAutomationGoal('Create an Excel expense sheet with formulas'), true);
  assert.equal(WorkflowPlanner.isAutomationGoal('Create a 5 slide PowerPoint on Quantum Computing'), true);

  const ytPlan = AutomationBrain.plan('Friday chrome kholo aur youtube pe lofi music play kar', {
    allowedFolders: [tempWorkDir],
    preferences: [],
  });
  assert.equal(ytPlan.scenarioKey, 'youtube_search_play');
  assert.equal(ytPlan.steps.length, 2);

  const browserSongPlan = AutomationBrain.plan('open chrome and play arjit song', {
    allowedFolders: [tempWorkDir],
    preferences: [],
  });
  assert.equal(browserSongPlan.scenarioKey, 'youtube_search_play');
  assert.equal(browserSongPlan.steps[1]?.params.query, 'arjit song');

  const loginPlan = AutomationBrain.plan('Create a login page in VS Code', {
    allowedFolders: [tempWorkDir],
    approvedExternalPaths: ['D:\\WebProjects'],
    preferences: [
      {
        key: 'preferred_web_folder',
        label: 'Preferred Web Folder',
        value: 'D:\\WebProjects',
        category: 'folder',
        updatedAt: new Date().toISOString(),
      },
    ],
  });
  assert.equal(loginPlan.scenarioKey, 'vscode_login_website');
  assert.ok(loginPlan.usesPreferences.some((p) => p.includes('D:\\WebProjects')));
  assert.equal(loginPlan.steps.length, 4);
});

test('SafetyManager and PermissionManager block prohibited actions and gate high-risk terminal/delete ops', () => {
  const blocked = SafetyManager.checkGoalPolicy('Help me bypass captcha and submit payment');
  assert.equal(blocked.allowed, false);

  const safeCmd = classifyTerminalCommandRisk('node -v');
  assert.equal(safeCmd.risk, 'SAFE');
  assert.equal(safeCmd.allowed, true);
  assert.equal(safeCmd.requiresConfirmation, false);

  const highCmd = classifyTerminalCommandRisk('rm -rf /');
  assert.equal(highCmd.risk, 'HIGH');
  assert.equal(highCmd.allowed, false);

  const injectionCmd = classifyTerminalCommandRisk('dir & whoami');
  assert.equal(injectionCmd.risk, 'HIGH');
  assert.equal(injectionCmd.allowed, false);

  const delDenied = PermissionManager.evaluateFileOperation({
    operation: 'delete',
    targetPath: path.join(tempWorkDir, 'sample.txt'),
    allowedFolders: [tempWorkDir],
    explicitlyConfirmed: false,
  });
  assert.equal(delDenied.allowed, false);
  assert.equal(delDenied.requiresConfirmation, true);
});

test('OOXML builders produce valid .docx, .xlsx (with SUM formulas), and 5-slide .pptx ZIP archives', () => {
  const docxPath = path.join(tempWorkDir, 'ai-report.docx');
  const docxBuf = buildDocxBuffer({
    title: 'Artificial Intelligence Overview',
    subtitle: 'Generated by F.R.I.D.A.Y.',
    sections: [{ heading: 'Summary', paragraphs: ['Autonomous offline intelligence report.'] }],
  });
  const docxRes = writeAndVerifyOfficeFile({ kind: 'docx', outputPath: docxPath, buffer: docxBuf });
  assert.equal(docxRes.ok, true);
  assert.ok(docxRes.entries.includes('word/document.xml'));

  const xlsxPath = path.join(tempWorkDir, 'expenses.xlsx');
  const xlsxBuf = buildXlsxBuffer([
    {
      name: 'Expenses',
      rows: [
        [{ value: 'Item', styleIndex: 1 }, { value: 'Cost', styleIndex: 1 }],
        [{ value: 'Hosting' }, { value: 1200 }],
        [{ value: 'Hardware' }, { value: 3800 }],
        [{ value: 'Total' }, { formula: '=SUM(B2:B3)', value: 5000 }],
      ],
    },
  ]);
  const xlsxRes = writeAndVerifyOfficeFile({ kind: 'xlsx', outputPath: xlsxPath, buffer: xlsxBuf });
  assert.equal(xlsxRes.ok, true);
  assert.ok(xlsxRes.entries.includes('xl/workbook.xml'));
  assert.ok(xlsxRes.entries.includes('xl/worksheets/sheet1.xml'));

  // Inflate sheet1.xml entry from the written archive to verify SUM(B2:B3) is actually present
  const rawXlsx = fs.readFileSync(xlsxPath);
  const idx = rawXlsx.indexOf(Buffer.from('xl/worksheets/sheet1.xml'));
  assert.ok(idx !== -1);
  // Also check raw buffer check helper
  const checkXlsx = verifyOoxmlZipBuffer(rawXlsx, ['[Content_Types].xml', 'xl/worksheets/sheet1.xml']);
  assert.equal(checkXlsx.valid, true);
  // Extract sheet1.xml deflated payload from local header
  const lfhOffset = rawXlsx.indexOf(Buffer.from('xl/worksheets/sheet1.xml')) - 30;
  const compSize = rawXlsx.readUInt32LE(lfhOffset + 18);
  const nameLen = rawXlsx.readUInt16LE(lfhOffset + 26);
  const extraLen = rawXlsx.readUInt16LE(lfhOffset + 28);
  const dataStart = lfhOffset + 30 + nameLen + extraLen;
  const sheetXml = zlib.inflateRawSync(rawXlsx.subarray(dataStart, dataStart + compSize)).toString('utf-8');
  assert.ok(sheetXml.includes('SUM(B2:B3)'));

  const pptxPath = path.join(tempWorkDir, 'ai-deck.pptx');
  const pptxBuf = buildPptxBuffer([
    { title: 'Slide 1', bullets: ['Intro'] },
    { title: 'Slide 2', bullets: ['Architecture'] },
    { title: 'Slide 3', bullets: ['Memory'] },
    { title: 'Slide 4', bullets: ['Automation'] },
    { title: 'Slide 5', bullets: ['Summary'] },
  ]);
  const pptxRes = writeAndVerifyOfficeFile({ kind: 'pptx', outputPath: pptxPath, buffer: pptxBuf });
  assert.equal(pptxRes.ok, true);
  assert.ok(pptxRes.entries.includes('ppt/slides/slide5.xml'));
});

test('Code scaffold, static validation + auto-fix, node --check, and live HTTP 200 preview verification', async () => {
  const projectDir = path.join(tempWorkDir, 'login-portal-test');
  fs.mkdirSync(projectDir, { recursive: true });

  const project = buildLoginWebsiteProject('TestLogin');
  for (const f of project.files) {
    fs.writeFileSync(path.join(projectDir, f.relativePath), f.content, 'utf-8');
  }

  // Inject deliberate defect (missing closing </body></html> and trailing open brace in CSS)
  const brokenHtml = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf-8').replace('</body>', '').replace('</html>', '');
  fs.writeFileSync(path.join(projectDir, 'index.html'), brokenHtml, 'utf-8');

  const preCheck = validateWebCodeStatic([
    { relativePath: 'index.html', content: brokenHtml },
  ]);
  assert.equal(preCheck.valid, false);

  const memFix = autoFixWebProjectFiles([{ relativePath: 'index.html', content: brokenHtml }]);
  assert.ok(memFix.appliedFixes.length >= 1);

  const dirFix = await checkAndAutoFixProjectDirectory({ projectDir, autoFix: true });
  assert.equal(dirFix.ok, true);
  assert.ok(dirFix.appliedFixes.length >= 1);

  const preview = await verifyWebProjectHttpPreview(projectDir);
  assert.equal(preview.ok, true);
  assert.equal(preview.httpStatus, 200);
  assert.ok(preview.body.includes('<html'));
});

test('Terminal executor allows SAFE node -v and blocks HIGH-risk rm -rf / without confirmation', async () => {
  const safeRes = await executeControlledTerminalCommand({
    command: 'node -v',
    cwd: tempWorkDir,
    allowedFolders: [tempWorkDir],
  });
  assert.equal(safeRes.ok, true);
  assert.equal(safeRes.exitCode, 0);
  assert.ok(safeRes.stdout.startsWith('v'));

  const blockedRes = await executeControlledTerminalCommand({
    command: 'rm -rf /',
    cwd: tempWorkDir,
    allowedFolders: [tempWorkDir],
    confirmed: false,
  });
  assert.equal(blockedRes.ok, false);
  assert.equal(blockedRes.risk, 'HIGH');
  assert.equal(blockedRes.requiresConfirmation, true);
});

test('AutomationFileManager stages reversible backups on overwrite and enforces delete confirmation', () => {
  const fileA = path.join(tempWorkDir, 'notes-backup-test.txt');
  const first = AutomationFileManager.writeFileSafe({
    filePath: fileA,
    content: 'version 1',
    allowedFolders: [tempWorkDir],
  });
  assert.equal(first.ok, true);

  const overwrite = AutomationFileManager.writeFileSafe({
    filePath: fileA,
    content: 'version 2',
    allowedFolders: [tempWorkDir],
    confirmed: true,
  });
  assert.equal(overwrite.ok, true);
  assert.ok(overwrite.backupPath && fs.existsSync(overwrite.backupPath));
  if (overwrite.backupPath) {
    assert.equal(fs.readFileSync(overwrite.backupPath, 'utf-8'), 'version 1');
    fs.rmSync(overwrite.backupPath, { force: true });
  }

  const unconfirmedDel = AutomationFileManager.deleteFileSafe({
    targetPath: fileA,
    allowedFolders: [tempWorkDir],
    confirmed: false,
  });
  assert.equal(unconfirmedDel.ok, false);
  assert.equal(unconfirmedDel.requiresConfirmation, true);
  assert.equal(fs.existsSync(fileA), true);

  const confirmedDel = AutomationFileManager.deleteFileSafe({
    targetPath: fileA,
    allowedFolders: [tempWorkDir],
    confirmed: true,
  });
  assert.equal(confirmedDel.ok, true);
  assert.equal(fs.existsSync(fileA), false);
  if (confirmedDel.backupPath) {
    fs.rmSync(confirmedDel.backupPath, { force: true });
  }
});

test('TaskVerificationEngine and ErrorRecoveryEngine enforce bounded retries and fallbacks', async () => {
  const vOk = TaskVerificationEngine.evaluate({
    expectation: { type: 'http_ok', description: 'Check preview' },
    httpStatus: 200,
    httpBody: '<html><body>ok</body></html>',
  });
  assert.equal(vOk.verified, true);

  const vBad = TaskVerificationEngine.evaluate({
    expectation: { type: 'file_exists', target: 'missing.txt', description: 'Check file' },
    fileExists: false,
  });
  assert.equal(vBad.verified, false);

  let count = 0;
  const rec = await ErrorRecoveryEngine.runWithRecovery<{ ok: boolean; error?: string; value?: string }>({
    strategy: { maxRetries: 1, fallbackAction: 'fallback', userHelpHint: 'Check setup' },
    attemptFn: async () => {
      count += 1;
      return { ok: false, error: 'Primary failed' };
    },
    fallbackFn: async () => ({ ok: true, value: 'recovered' }),
  });
  assert.equal(count, 2);
  assert.equal(rec.usedFallback, true);
  assert.equal(rec.result.ok, true);
});

test('AutomationTaskManager executes full workflow end-to-end and persists preferences & task state in SQLite', async () => {
  const db = loadDb();
  db.settings.allowedFolders = [tempWorkDir];
  saveDb(db);

  const savedPref = saveWorkflowPreference({
    key: 'preferred_web_folder',
    label: 'Preferred Website Projects Folder',
    value: tempWorkDir,
    category: 'folder',
  });
  assert.equal(savedPref.value, tempWorkDir);
  assert.ok(listWorkflowPreferences().some((p) => p.key === 'preferred_web_folder'));

  const task = await automationTaskManager.createAndStartTask({
    goal: 'Create a responsive HTML CSS JS login page project and verify preview',
    confirmed: true,
    waitForCompletion: true,
  });
  assert.equal(task.state, 'completed');
  assert.equal(task.progressPercent, 100);
  assert.ok(task.steps.every((s) => s.verified));
  assert.ok(task.artifacts.some((a) => a.endsWith('index.html')));

  const persisted = listBackgroundTaskRecords(10).find((t) => t.id === task.id);
  assert.ok(persisted);
  assert.equal(persisted.state, 'completed');

  // Test pause/cancel gating on confirmation-held task
  const gatedTask = await automationTaskManager.createAndStartTask({
    goal: `Delete file ${path.join(tempWorkDir, 'nonexistent.txt')}`,
    confirmed: false,
    waitForCompletion: true,
  });
  assert.equal(gatedTask.state, 'waiting_for_user');
  const cancelled = await automationTaskManager.cancelTask(gatedTask.id);
  assert.equal(cancelled?.state, 'cancelled');

  assert.equal(deleteWorkflowPreference('preferred_web_folder'), true);
});
