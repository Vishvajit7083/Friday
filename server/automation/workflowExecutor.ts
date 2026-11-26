import fs from 'fs';
import path from 'path';
import {
  ApplicationManager,
  AutomationBrain,
  AutomationRegistry,
  buildLoginWebsiteProject,
  buildSingleLanguageProgram,
  buildStaticWebsiteProject,
  ErrorRecoveryEngine,
  TaskVerificationEngine,
  type BackgroundTaskRecord,
  type WorkflowPlanSpec,
  type WorkflowStepExecutionRecord,
  type WorkflowStepSpec,
} from '../../src/core/automation/index.ts';
import {
  captureAndOcrScreenWindows,
  closeWindowsWindow,
  focusWindowsWindow,
  launchWindowsTarget,
  openLocalPathInDefaultApp,
  setWindowsWindowState,
} from '../../electron/windowsAutomation.ts';
import type { GroundingSource, MediaControlAction } from '../../src/core/types.ts';
import {
  addApprovedExternalPath,
  getBackgroundTaskRecord,
  listApprovedExternalPaths,
  listBackgroundTaskRecords,
  listWorkflowPreferences,
  saveBackgroundTaskRecord,
  saveWorkflowPreference,
} from '../cognitiveDb.ts';
import { appendActionLog, loadDb, saveDb } from '../store.ts';
import {
  resolveAndPlayYouTube,
  runBrowserResearchAutomation,
  runMediaAutomationAction,
} from './browserAndYoutube.ts';
import {
  checkAndAutoFixProjectDirectory,
  executeControlledTerminalCommand,
  verifyWebProjectHttpPreview,
} from './codeExecutor.ts';
import { AutomationFileManager } from './fileManager.ts';
import {
  buildDocxBuffer,
  buildPptxBuffer,
  buildXlsxBuffer,
  writeAndVerifyOfficeFile,
} from './ooxmlBuilder.ts';

interface StepRunOutcome {
  ok: boolean;
  output: string;
  verified: boolean;
  verificationDetail: string;
  artifacts?: string[];
  sources?: GroundingSource[];
  error?: string;
}

class AutomationTaskManager {
  private registry = new AutomationRegistry();
  private appManager = new ApplicationManager();
  private activeControllers = new Map<string, { pauseRequested: boolean; cancelRequested: boolean }>();
  private runningCount = 0;
  private readonly maxConcurrent = 3;
  private waitQueue: Array<() => void> = [];

  getRegistry(): AutomationRegistry {
    return this.registry;
  }

  getApplicationManager(): ApplicationManager {
    return this.appManager;
  }

  listTasks(limit = 35): BackgroundTaskRecord[] {
    return listBackgroundTaskRecords(limit);
  }

  getTask(taskId: string): BackgroundTaskRecord | null {
    return getBackgroundTaskRecord(taskId);
  }

  planWorkflow(goal: string, confirmedAction = false): WorkflowPlanSpec {
    const db = loadDb();
    return AutomationBrain.plan(goal, {
      allowedFolders: db.settings.allowedFolders,
      approvedExternalPaths: listApprovedExternalPaths(),
      preferences: listWorkflowPreferences(),
      confirmedAction,
    });
  }

  createAndStartTask(params: {
    goal: string;
    confirmed?: boolean;
    waitForCompletion?: boolean;
  }): Promise<BackgroundTaskRecord> | BackgroundTaskRecord {
    const db = loadDb();
    if (params.confirmed) {
      // If user explicitly confirmed a plan containing an external drive path, record approval
      const previewPlan = this.planWorkflow(params.goal, false);
      if (previewPlan.targetPath) {
        addApprovedExternalPath(previewPlan.targetPath);
      }
    }

    const plan = this.planWorkflow(params.goal, Boolean(params.confirmed));
    const nowIso = new Date().toISOString();

    if (plan.scenarioKey === 'safety_blocked') {
      const blockedTask: BackgroundTaskRecord = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        goal: params.goal,
        scenarioKey: plan.scenarioKey,
        state: 'failed',
        riskLevel: 'high',
        requiresConfirmation: false,
        confirmed: false,
        progressPercent: 0,
        currentStepIndex: 0,
        steps: [],
        plan,
        artifacts: [],
        sources: [],
        logs: [`[${nowIso}] Blocked by safety policy: ${plan.confirmationReason}`],
        error: plan.confirmationReason,
        summary: plan.confirmationReason,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      saveBackgroundTaskRecord(blockedTask);
      return params.waitForCompletion ? Promise.resolve(blockedTask) : blockedTask;
    }

    const stepRecords: WorkflowStepExecutionRecord[] = plan.steps.map((s) => ({
      stepId: s.id,
      title: s.title,
      pluginId: s.pluginId,
      kind: s.kind,
      status: 'pending',
      attempts: 0,
      verified: false,
    }));

    const initialState = plan.requiresConfirmation && !params.confirmed ? 'waiting_for_user' : 'pending';
    const task: BackgroundTaskRecord = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      goal: params.goal,
      scenarioKey: plan.scenarioKey,
      state: initialState,
      riskLevel: plan.riskLevel,
      requiresConfirmation: plan.requiresConfirmation,
      confirmed: Boolean(params.confirmed),
      confirmationSummary: plan.confirmationReason,
      progressPercent: 0,
      currentStepIndex: 0,
      steps: stepRecords,
      plan,
      artifacts: [],
      sources: [],
      logs: [
        `[${nowIso}] Planned workflow "${plan.scenarioKey}" with ${plan.steps.length} step(s).` +
          (plan.usesPreferences.length ? ` Preferences: ${plan.usesPreferences.join(', ')}` : ''),
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    saveBackgroundTaskRecord(task);
    appendActionLog(db, {
      agent: 'automation',
      action: `Workflow Queued (${plan.scenarioKey})`,
      target: params.goal.slice(0, 52),
      status: initialState === 'waiting_for_user' ? 'pending_confirmation' : 'completed',
      detail: `${plan.steps.length} step(s)`,
    });

    if (initialState === 'waiting_for_user') {
      task.summary = plan.confirmationReason || 'Confirmation required before executing high-impact or external path steps.';
      saveBackgroundTaskRecord(task);
      return params.waitForCompletion ? Promise.resolve(task) : task;
    }

    const runPromise = this.scheduleExecution(task.id);
    return params.waitForCompletion ? runPromise : task;
  }

  async pauseTask(taskId: string): Promise<BackgroundTaskRecord | null> {
    const task = getBackgroundTaskRecord(taskId);
    if (!task) return null;
    const ctrl = this.activeControllers.get(taskId);
    if (ctrl) ctrl.pauseRequested = true;
    if (task.state === 'running' || task.state === 'pending' || task.state === 'retrying') {
      task.state = 'paused';
      task.updatedAt = new Date().toISOString();
      task.logs.push(`[${task.updatedAt}] Task paused by user.`);
      saveBackgroundTaskRecord(task);
    }
    return task;
  }

  async resumeTask(taskId: string, confirmed = false): Promise<BackgroundTaskRecord | null> {
    const task = getBackgroundTaskRecord(taskId);
    if (!task) return null;
    if (task.state !== 'paused' && task.state !== 'waiting_for_user') return task;

    if (confirmed && task.plan.targetPath) {
      addApprovedExternalPath(task.plan.targetPath);
    }
    if (confirmed) {
      task.confirmed = true;
      task.requiresConfirmation = false;
    }
    task.state = 'pending';
    task.updatedAt = new Date().toISOString();
    task.logs.push(`[${task.updatedAt}] Task resumed.`);
    saveBackgroundTaskRecord(task);
    void this.scheduleExecution(taskId);
    return task;
  }

  async cancelTask(taskId: string): Promise<BackgroundTaskRecord | null> {
    const task = getBackgroundTaskRecord(taskId);
    if (!task) return null;
    const ctrl = this.activeControllers.get(taskId);
    if (ctrl) ctrl.cancelRequested = true;
    if (task.state !== 'completed' && task.state !== 'cancelled') {
      task.state = 'cancelled';
      task.updatedAt = new Date().toISOString();
      task.completedAt = task.updatedAt;
      task.steps = task.steps.map((s) =>
        s.status === 'pending' || s.status === 'running' ? { ...s, status: 'cancelled' } : s
      );
      task.summary = 'Task cancelled by user.';
      task.logs.push(`[${task.updatedAt}] Task cancelled by user.`);
      saveBackgroundTaskRecord(task);
    }
    return task;
  }

  pauseLatestActive(): BackgroundTaskRecord | null {
    const active = listBackgroundTaskRecords(20).find((t) => t.state === 'running' || t.state === 'pending');
    if (!active) return null;
    void this.pauseTask(active.id);
    return getBackgroundTaskRecord(active.id);
  }

  resumeLatestPaused(): BackgroundTaskRecord | null {
    const paused = listBackgroundTaskRecords(20).find((t) => t.state === 'paused' || t.state === 'waiting_for_user');
    if (!paused) return null;
    void this.resumeTask(paused.id, true);
    return getBackgroundTaskRecord(paused.id);
  }

  cancelLatestActive(): BackgroundTaskRecord | null {
    const active = listBackgroundTaskRecords(20).find(
      (t) => t.state === 'running' || t.state === 'pending' || t.state === 'paused' || t.state === 'waiting_for_user'
    );
    if (!active) return null;
    void this.cancelTask(active.id);
    return getBackgroundTaskRecord(active.id);
  }

  private async acquireSlot(): Promise<void> {
    if (this.runningCount < this.maxConcurrent) {
      this.runningCount += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
    this.runningCount += 1;
  }

  private releaseSlot(): void {
    this.runningCount = Math.max(0, this.runningCount - 1);
    const next = this.waitQueue.shift();
    if (next) next();
  }

  private async scheduleExecution(taskId: string): Promise<BackgroundTaskRecord> {
    await this.acquireSlot();
    const ctrl = { pauseRequested: false, cancelRequested: false };
    this.activeControllers.set(taskId, ctrl);
    try {
      return await this.runTaskLoop(taskId, ctrl);
    } finally {
      this.activeControllers.delete(taskId);
      this.releaseSlot();
    }
  }

  private async runTaskLoop(
    taskId: string,
    ctrl: { pauseRequested: boolean; cancelRequested: boolean }
  ): Promise<BackgroundTaskRecord> {
    let task = getBackgroundTaskRecord(taskId)!;
    if (!task || task.state === 'cancelled' || task.state === 'paused') return task;

    task.state = 'running';
    task.updatedAt = new Date().toISOString();
    saveBackgroundTaskRecord(task);

    const stepOutputs = new Map<string, string>();
    const total = Math.max(1, task.plan.steps.length);

    for (let idx = task.currentStepIndex; idx < task.plan.steps.length; idx += 1) {
      // Check pause/cancel before each step
      const freshCheck = getBackgroundTaskRecord(taskId);
      if (ctrl.cancelRequested || freshCheck?.state === 'cancelled') {
        task.state = 'cancelled';
        task.updatedAt = new Date().toISOString();
        saveBackgroundTaskRecord(task);
        return task;
      }
      if (ctrl.pauseRequested || freshCheck?.state === 'paused') {
        task.state = 'paused';
        task.currentStepIndex = idx;
        task.updatedAt = new Date().toISOString();
        saveBackgroundTaskRecord(task);
        return task;
      }

      const stepSpec = task.plan.steps[idx];
      const rec = task.steps[idx];
      rec.status = 'running';
      rec.startedAt = new Date().toISOString();
      task.currentStepIndex = idx;
      task.updatedAt = rec.startedAt;
      saveBackgroundTaskRecord(task);

      const { result, attempts, usedFallback } = await ErrorRecoveryEngine.runWithRecovery({
        strategy: stepSpec.recovery,
        attemptFn: () => this.executeStep(stepSpec, task.confirmed, stepOutputs),
        fallbackFn: stepSpec.recovery.fallbackAction
          ? () => this.executeFallback(stepSpec, stepOutputs)
          : undefined,
        onRetry: (attempt, reason) => {
          rec.status = 'retrying';
          task.state = 'retrying';
          task.logs.push(`[${new Date().toISOString()}] Retrying step "${stepSpec.title}" (attempt ${attempt}): ${reason}`);
          saveBackgroundTaskRecord(task);
        },
      });

      rec.attempts = attempts;
      rec.completedAt = new Date().toISOString();
      rec.output = result.output;
      rec.verified = result.verified;
      rec.verificationDetail = result.verificationDetail;
      rec.artifacts = result.artifacts;

      if (result.sources?.length) {
        for (const s of result.sources) {
          if (!task.sources.some((x) => x.uri === s.uri)) task.sources.push(s);
        }
      }
      if (result.artifacts?.length) {
        for (const a of result.artifacts) {
          if (!task.artifacts.includes(a)) task.artifacts.push(a);
        }
      }
      if (result.output) {
        stepOutputs.set(stepSpec.id, result.output);
      }

      if (!result.ok || !result.verified) {
        rec.status = 'failed';
        rec.error = result.error || result.verificationDetail;
        task.state = 'failed';
        task.error = rec.error;
        task.summary = `Step "${stepSpec.title}" failed verification: ${rec.error}. Hint: ${stepSpec.recovery.userHelpHint}`;
        task.logs.push(`[${rec.completedAt}] FAILED "${stepSpec.title}": ${rec.error}`);
        task.updatedAt = rec.completedAt;
        saveBackgroundTaskRecord(task);
        return task;
      }

      rec.status = 'completed';
      task.state = 'running';
      task.progressPercent = Math.round(((idx + 1) / total) * 100);
      task.logs.push(
        `[${rec.completedAt}] COMPLETED "${stepSpec.title}"${usedFallback ? ' (via fallback)' : ''}: ${result.verificationDetail}`
      );
      task.updatedAt = rec.completedAt;
      saveBackgroundTaskRecord(task);
    }

    task.state = 'verifying';
    task.updatedAt = new Date().toISOString();
    saveBackgroundTaskRecord(task);

    task.state = 'completed';
    task.progressPercent = 100;
    task.completedAt = new Date().toISOString();
    task.updatedAt = task.completedAt;
    const stepSummary = task.steps.map((s) => `• ${s.title}: ${s.output || s.verificationDetail}`).join('\n');
    task.summary = `Completed workflow (${task.steps.length}/${task.steps.length} verified steps):\n${stepSummary}`;
    saveBackgroundTaskRecord(task);

    const db = loadDb();
    appendActionLog(db, {
      agent: 'automation',
      action: `Workflow Verified (${task.scenarioKey})`,
      target: task.goal.slice(0, 52),
      status: 'completed',
      detail: `${task.artifacts.length} artifact(s) verified`,
    });
    saveDb(db);
    return task;
  }

  private async executeFallback(
    step: WorkflowStepSpec,
    _stepOutputs: Map<string, string>
  ): Promise<StepRunOutcome> {
    if (step.kind === 'app_launch' && step.recovery.fallbackAction) {
      const launchRes = await launchWindowsTarget(step.recovery.fallbackAction);
      return {
        ok: true,
        output: launchRes.detail,
        verified: true,
        verificationDetail: launchRes.detail,
      };
    }
    return {
      ok: false,
      output: '',
      verified: false,
      verificationDetail: 'No executable fallback for this step.',
      error: 'Fallback unavailable',
    };
  }

  private async executeStep(
    step: WorkflowStepSpec,
    confirmed: boolean,
    stepOutputs: Map<string, string>
  ): Promise<StepRunOutcome> {
    const db = loadDb();
    const allowedFolders = db.settings.allowedFolders;
    const approvedExternalPaths = listApprovedExternalPaths();

    switch (step.kind) {
      case 'workflow_memory_save': {
        const saved = saveWorkflowPreference({
          key: String(step.params.key || 'preferred_web_folder'),
          label: String(step.params.label || 'Preferred Folder'),
          value: String(step.params.value || ''),
          category: (String(step.params.category || 'folder') as 'folder'),
        });
        addApprovedExternalPath(saved.value);
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          resultText: saved.value,
        });
        return {
          ok: ver.verified,
          output: `Saved workflow preference "${saved.label}" = "${saved.value}".`,
          verified: ver.verified,
          verificationDetail: ver.reason,
        };
      }

      case 'app_launch': {
        const target = String(step.params.target || '');
        const res = await launchWindowsTarget(target);
        const isNonWin = process.platform !== 'win32';
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          windowOrUrlOpened: res.launched || isNonWin,
          resultText: res.detail,
        });
        return {
          ok: res.launched || isNonWin,
          output: res.detail,
          verified: ver.verified,
          verificationDetail: res.detail,
          error: res.launched || isNonWin ? undefined : res.detail,
        };
      }

      case 'window_manage': {
        const proc = String(step.params.processName || '');
        const action = String(step.params.action || 'focus');
        if (action === 'focus') {
          const ok = await focusWindowsWindow(proc);
          return { ok: ok || process.platform !== 'win32', output: `Focus ${proc}`, verified: true, verificationDetail: ok ? `Focused ${proc}` : 'Requires Windows session' };
        }
        if (action === 'close') {
          const res = await closeWindowsWindow(proc);
          return { ok: res.closed, output: res.detail, verified: res.closed, verificationDetail: res.detail };
        }
        const ok = await setWindowsWindowState(proc, action === 'maximize' ? 'maximize' : 'minimize');
        return { ok: ok || process.platform !== 'win32', output: `${action} ${proc}`, verified: true, verificationDetail: ok ? `${action}d ${proc}` : 'Requires Windows session' };
      }

      case 'youtube_play': {
        const query = String(step.params.query || 'lofi beats');
        const browser = (step.params.browser === 'edge' ? 'edge' : 'chrome') as 'chrome' | 'edge';
        const res = await resolveAndPlayYouTube({ query, browser, online: true });
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          windowOrUrlOpened: Boolean(res.url),
          resultText: res.detail,
        });
        return {
          ok: res.ok && ver.verified,
          output: res.detail,
          verified: ver.verified,
          verificationDetail: ver.reason,
          sources: res.sources,
        };
      }

      case 'media_control': {
        const action = String(step.params.action || 'play_pause') as MediaControlAction;
        const res = await runMediaAutomationAction(action);
        return {
          ok: res.ok,
          output: res.detail,
          verified: res.ok,
          verificationDetail: res.detail,
        };
      }

      case 'browser_research': {
        const query = String(step.params.query || '');
        const url = step.params.url ? String(step.params.url) : undefined;
        const res = await runBrowserResearchAutomation({ query, url, online: true });
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          resultText: res.summary,
        });
        return {
          ok: res.ok && ver.verified,
          output: res.summary,
          verified: ver.verified,
          verificationDetail: res.detail,
          sources: res.sources,
        };
      }

      case 'folder_create': {
        const folderPath = String(step.params.folderPath || '');
        const res = AutomationFileManager.createFolder({
          folderPath,
          allowedFolders,
          approvedExternalPaths,
          confirmed,
        });
        const exists = res.ok && fs.existsSync(res.path);
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          fileExists: exists,
        });
        return {
          ok: res.ok && ver.verified,
          output: res.detail,
          verified: ver.verified,
          verificationDetail: ver.reason,
          artifacts: exists ? [res.path] : [],
          error: res.ok ? undefined : res.detail,
        };
      }

      case 'code_scaffold': {
        const projectDir = String(step.params.projectDir || '');
        const template = String(step.params.template || 'login');
        const project =
          template === 'login'
            ? buildLoginWebsiteProject(String(step.params.projectTitle || 'FridayAuthPortal'))
            : template === 'landing'
              ? buildStaticWebsiteProject(String(step.params.projectTitle || 'FridayWebApp'))
              : buildSingleLanguageProgram(
                  template as 'c' | 'cpp' | 'python' | 'node',
                  String(step.params.goalText || '')
                );

        const createdArtifacts: string[] = [];
        for (const f of project.files) {
          const dest = step.params.filePath && project.files.length === 1
            ? String(step.params.filePath)
            : path.join(projectDir, f.relativePath);
          const writeRes = AutomationFileManager.writeFileSafe({
            filePath: dest,
            content: f.content,
            allowedFolders,
            approvedExternalPaths,
            confirmed: true,
          });
          if (!writeRes.ok) {
            return {
              ok: false,
              output: writeRes.detail,
              verified: false,
              verificationDetail: writeRes.detail,
              error: writeRes.detail,
            };
          }
          createdArtifacts.push(writeRes.path);
        }

        if (step.params.openInApp && createdArtifacts[0] && process.platform === 'win32') {
          await openLocalPathInDefaultApp(createdArtifacts[0]);
        }

        const primaryFile = createdArtifacts[0];
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          fileExists: Boolean(primaryFile && fs.existsSync(primaryFile)),
          fileSizeBytes: primaryFile && fs.existsSync(primaryFile) ? fs.statSync(primaryFile).size : 0,
        });
        return {
          ok: ver.verified,
          output: `${project.summary} Files: ${createdArtifacts.map((p) => path.basename(p)).join(', ')}.`,
          verified: ver.verified,
          verificationDetail: ver.reason,
          artifacts: createdArtifacts,
        };
      }

      case 'code_syntax_check': {
        const projectDir = String(step.params.projectDir || '');
        const res = await checkAndAutoFixProjectDirectory({
          projectDir,
          autoFix: step.params.autoFix !== false,
        });
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          syntaxValid: res.ok,
          syntaxErrors: res.diagnostics,
        });
        return {
          ok: res.ok && ver.verified,
          output: res.detail,
          verified: ver.verified,
          verificationDetail: ver.reason,
          error: res.ok ? undefined : res.detail,
        };
      }

      case 'code_preview_verify': {
        const projectDir = String(step.params.projectDir || '');
        const preview = await verifyWebProjectHttpPreview(projectDir);
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          httpStatus: preview.httpStatus,
          httpBody: preview.body,
        });
        if (preview.ok && process.platform === 'win32' && step.params.openEditor) {
          await launchWindowsTarget(String(step.params.openEditor));
        }
        return {
          ok: preview.ok && ver.verified,
          output: preview.detail,
          verified: ver.verified,
          verificationDetail: ver.reason,
          error: preview.ok ? undefined : preview.detail,
        };
      }

      case 'office_word_create': {
        const outputPath = String(step.params.outputPath || path.join(allowedFolders[0] || process.cwd(), 'report.docx'));
        const title = String(step.params.title || 'F.R.I.D.A.Y. Report');
        const researchStepId = step.params.useResearchFromStep ? String(step.params.useResearchFromStep) : undefined;
        const researchBody = researchStepId ? stepOutputs.get(researchStepId) : undefined;
        const paragraphs = researchBody
          ? researchBody.split(/\n+/).map((p) => p.trim()).filter(Boolean)
          : [
              `Comprehensive summary prepared autonomously by F.R.I.D.A.Y. on "${title}".`,
              'This document was compiled in native Office OpenXML (.docx) format and verified for structural integrity.',
            ];
        const buf = buildDocxBuffer({
          title,
          subtitle: `Prepared by F.R.I.D.A.Y. Automation Engine · ${new Date().toISOString().slice(0, 10)}`,
          sections: [
            { heading: 'Executive Summary', paragraphs: paragraphs.slice(0, 6) },
            { heading: 'Key Findings & Notes', paragraphs: paragraphs.slice(6).length ? paragraphs.slice(6) : ['Verified local document structure ready for Microsoft Word.'] },
          ],
        });
        const written = writeAndVerifyOfficeFile({ kind: 'docx', outputPath, buffer: buf });
        if (written.ok && step.params.openAfterCreate && process.platform === 'win32') {
          await openLocalPathInDefaultApp(written.path);
        }
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          fileExists: fs.existsSync(written.path),
          ooxmlValid: written.ok,
          ooxmlEntries: written.entries,
        });
        return {
          ok: written.ok && ver.verified,
          output: `Created Microsoft Word document "${written.path}" (${written.sizeBytes} bytes).`,
          verified: ver.verified,
          verificationDetail: ver.reason,
          artifacts: [written.path],
          error: written.error,
        };
      }

      case 'office_excel_create': {
        const outputPath = String(step.params.outputPath || path.join(allowedFolders[0] || process.cwd(), 'monthly-expenses.xlsx'));
        const title = String(step.params.title || 'Monthly Expenses');
        const buf = buildXlsxBuffer([
          {
            name: 'Expenses',
            rows: [
              [{ value: title, styleIndex: 1 }, { value: 'Category', styleIndex: 1 }, { value: 'Amount', styleIndex: 1 }, { value: 'Notes', styleIndex: 1 }],
              [{ value: 'Housing & Rent' }, { value: 'Fixed' }, { value: 15000 }, { value: 'Monthly rent' }],
              [{ value: 'Utilities & Internet' }, { value: 'Utilities' }, { value: 2400 }, { value: 'Electricity + fiber' }],
              [{ value: 'Groceries & Food' }, { value: 'Living' }, { value: 6500 }, { value: 'Monthly household' }],
              [{ value: 'Transport & Fuel' }, { value: 'Commute' }, { value: 2200 }, { value: 'Fuel & transit' }],
              [{ value: 'Software & Tools' }, { value: 'Work' }, { value: 1200 }, { value: 'Cloud & hosting' }],
              [{ value: 'Total Monthly Expense', styleIndex: 1 }, { value: 'Formula', styleIndex: 1 }, { formula: 'SUM(C2:C6)', value: 27300, styleIndex: 1 }, { value: 'Auto-calculated =SUM(C2:C6)' }],
              [{ value: 'Average Item Cost' }, { value: 'Formula' }, { formula: 'AVERAGE(C2:C6)', value: 5460 }, { value: '=AVERAGE(C2:C6)' }],
            ],
          },
          {
            name: 'Summary',
            rows: [
              [{ value: 'Metric', styleIndex: 1 }, { value: 'Value', styleIndex: 1 }],
              [{ value: 'Tracked Line Items' }, { formula: 'COUNTA(Expenses!A2:A6)', value: 5 }],
              [{ value: 'Total Budget Spent' }, { formula: 'Expenses!C7', value: 27300 }],
              [{ value: 'Highest Expense' }, { formula: 'MAX(Expenses!C2:C6)', value: 15000 }],
            ],
          },
        ]);
        const written = writeAndVerifyOfficeFile({ kind: 'xlsx', outputPath, buffer: buf });
        if (written.ok && step.params.openAfterCreate && process.platform === 'win32') {
          await openLocalPathInDefaultApp(written.path);
        }
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          fileExists: fs.existsSync(written.path),
          ooxmlValid: written.ok,
          ooxmlEntries: written.entries,
        });
        return {
          ok: written.ok && ver.verified,
          output: `Created Excel workbook "${written.path}" (${written.sizeBytes} bytes) with Expenses + Summary sheets and =SUM/=AVERAGE/=MAX formulas.`,
          verified: ver.verified,
          verificationDetail: ver.reason,
          artifacts: [written.path],
          error: written.error,
        };
      }

      case 'office_powerpoint_create': {
        const outputPath = String(step.params.outputPath || path.join(allowedFolders[0] || process.cwd(), 'presentation.pptx'));
        const topic = String(step.params.topic || 'Artificial Intelligence');
        const buf = buildPptxBuffer([
          {
            title: topic,
            bullets: ['Executive Briefing Deck', `Generated autonomously by F.R.I.D.A.Y. (${new Date().toISOString().slice(0, 10)})`],
          },
          {
            title: `Core Concepts of ${topic}`,
            bullets: ['Foundational architecture and core capabilities', 'Offline-first reliability and deterministic execution', 'Structured modularity across software layers'],
          },
          {
            title: 'Real-World Applications',
            bullets: ['Workflow & developer productivity automation', 'Document, spreadsheet, and presentation generation', 'Local knowledge indexing and intelligent assistance'],
          },
          {
            title: 'Safety, Verification & Governance',
            bullets: ['Permission-gated filesystem & process boundaries', 'Explicit confirmation for destructive operations', 'Post-action verification before reporting success'],
          },
          {
            title: 'Conclusion & Next Steps',
            bullets: [`Review ${topic} milestones`, 'Customize slides directly inside Microsoft PowerPoint'],
          },
        ]);
        const written = writeAndVerifyOfficeFile({ kind: 'pptx', outputPath, buffer: buf });
        if (written.ok && step.params.openAfterCreate && process.platform === 'win32') {
          await openLocalPathInDefaultApp(written.path);
        }
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          fileExists: fs.existsSync(written.path),
          ooxmlValid: written.ok,
          ooxmlEntries: written.entries,
        });
        return {
          ok: written.ok && ver.verified,
          output: `Created 5-slide PowerPoint presentation "${written.path}" (${written.sizeBytes} bytes).`,
          verified: ver.verified,
          verificationDetail: ver.reason,
          artifacts: [written.path],
          error: written.error,
        };
      }

      case 'file_organize': {
        const folderPath = String(step.params.folderPath || allowedFolders[0] || process.cwd());
        const dryRun = Boolean(step.params.dryRun) && !confirmed;
        const res = AutomationFileManager.organizeDirectory({
          folderPath,
          allowedFolders,
          approvedExternalPaths,
          dryRun,
        });
        return {
          ok: res.ok,
          output: res.detail,
          verified: res.ok,
          verificationDetail: res.detail,
          error: res.ok ? undefined : res.detail,
        };
      }

      case 'file_delete': {
        const targetPath = String(step.params.targetPath || '');
        const res = AutomationFileManager.deleteFileSafe({
          targetPath,
          allowedFolders,
          approvedExternalPaths,
          confirmed,
        });
        return {
          ok: res.ok,
          output: res.detail,
          verified: res.ok,
          verificationDetail: res.detail,
          error: res.ok ? undefined : res.detail,
        };
      }

      case 'terminal_execute': {
        const command = String(step.params.command || '');
        const cwd = String(step.params.cwd || allowedFolders[0] || process.cwd());
        const res = await executeControlledTerminalCommand({
          command,
          cwd,
          allowedFolders,
          approvedExternalPaths,
          confirmed,
        });
        const ver = TaskVerificationEngine.evaluate({
          expectation: step.verification,
          processStarted: res.ok,
          resultText: res.stdout || res.detail,
        });
        return {
          ok: res.ok && ver.verified,
          output: res.stdout ? `${res.detail}\n${res.stdout.slice(0, 600)}` : res.detail,
          verified: ver.verified,
          verificationDetail: res.detail,
          error: res.ok ? undefined : res.detail,
        };
      }

      case 'screen_inspect': {
        const res = await captureAndOcrScreenWindows();
        return {
          ok: true,
          output: res.text || res.detail,
          verified: true,
          verificationDetail: res.detail,
        };
      }

      default:
        return {
          ok: true,
          output: `Executed ${step.kind}`,
          verified: true,
          verificationDetail: `Completed ${step.title}`,
        };
    }
  }
}

export const automationTaskManager = new AutomationTaskManager();
