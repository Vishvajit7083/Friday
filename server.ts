import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { appendActionLog, loadDb, saveDb } from './server/store.ts';
import {
  closeWindowSafe,
  detectInstalledApps,
  getSystemTelemetry,
  getTopProcesses,
  launchApplication,
} from './server/systemService.ts';
import {
  getWeatherForCoordinates,
  getWeatherForLocation,
  searchWeatherLocations,
} from './server/weatherService.ts';
import {
  cancelFileIndexing,
  createPermittedFolder,
  getCachedFileIndex,
  getFileIndexProgress,
  getPersistedOrIndexedFiles,
  invalidateFileIndexCache,
  isPathPermitted,
  pauseFileIndexing,
  readPermittedFilePreview,
  removePermittedFolderFromIndex,
  resumeFileIndexing,
  startBackgroundFileIndexing,
  validateAndNormalizeFolder,
} from './server/fileService.ts';
import {
  analyzeMediaOrScreen,
  checkAiHealth,
  generateDailyBriefing,
  getRecentPipelineTimings,
  runAssistantCommand,
  runBrowserResearch,
  streamAssistantCommand,
  summarizeLocalFile,
  synthesizeSpeechWav,
  transcribeAudioBase64,
} from './server/aiService.ts';
import { performVisualAnalysis } from './server/visualAnalysisEngine.ts';
import type { VisualAnalysisRequest } from './src/core/visualAnalysisTypes.ts';
import {
  defaultOpenJarvisOrchestrator,
  profileSystemHardware,
  getOpenJarvisModelCatalog,
  startSafeModelDownload,
  getDownloadStatus,
  cancelModelDownload,
  defaultTraceRecorder,
} from './server/openjarvis/index.ts';
import {
  appendTrainingDatasetSample,
  addApprovedExternalPath,
  closeCognitiveSqlite,
  deleteCognitiveMemory,
  deleteDynamicIntent,
  deleteWorkflowPreference,
  exportCognitiveMemoriesJson,
  getPreferenceProfile,
  getSavedTokenizerArtifact,
  importCognitiveMemoriesJson,
  listCognitiveMemories,
  listCustomLexicon,
  listDynamicIntents,
  listKnowledgeChunks,
  listLearningCorrections,
  listTaskPatternSuggestions,
  listTaskPlans,
  listTrainingDatasetSamples,
  listWorkflowPreferences,
  saveCognitiveMemory,
  saveDynamicIntent,
  saveLexiconEntry,
  savePreferenceProfile,
  saveTaskPatternSuggestion,
  saveTokenizerArtifact,
  saveWorkflowPreference,
  searchCognitiveMemories,
  updateCognitiveMemory,
} from './server/cognitiveDb.ts';
import { automationTaskManager } from './server/automation/workflowExecutor.ts';
import {
  addUserKnowledgeFact,
  indexKnowledgeSources,
  searchKnowledgeBase,
} from './server/knowledgeEngine.ts';
import { defaultSpeechProvider } from './server/speechProvider.ts';
import {
  checkNetworkOnline,
  getServerCognitiveOrchestrator,
  runCognitiveTurn,
} from './server/cognitiveRuntime.ts';
import { DynamicIntentRegistry } from './src/core/cognitive/intentRegistry.ts';
import {
  formatTrainingDatasetJsonl,
  learnVocabularyTerm,
  trainBpeStyleTokenizer,
} from './src/core/cognitive/learningPipeline.ts';
import type { MemoryLayer } from './src/core/cognitive/types.ts';
import {
  closeWindowsWindow,
  focusWindowsWindow,
  getWindowsSpeechCapabilities,
  listActiveWindows,
  openLocalPathInDefaultApp,
  openWindowsFolder,
  openWindowsWebsite,
  revealFileInWindowsExplorer,
  sendWindowsMediaKey,
  setWindowsWindowState,
} from './electron/windowsAutomation.ts';
import {
  getWindowsCompatibilityAudit,
  runSafeDiagnosticsSuite,
  writeTestReportFile,
} from './server/diagnosticsService.ts';
import {
  formatTestReportMarkdown,
  sanitizeCalendarPatch,
  sanitizeMemoryPatch,
  sanitizeNotePatch,
  sanitizeSettingsPatch,
  sanitizeTodoPatch,
} from './src/core/diagnostics.ts';
import { findDuplicateGroups, searchIndexedFiles } from './src/core/fileIndex.ts';
import type { CalendarEvent, MediaControlAction, MemoryItem, NoteItem, TodoItem } from './src/core/types.ts';

function resolveListenPort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return Number(process.env.PORT) || 3000;
}

export async function startServer(portOverride?: number): Promise<{ port: number; close: () => Promise<void> }> {
  const app = express();
  const PORT = portOverride ?? resolveListenPort();

  app.use(express.json({ limit: '15mb' }));

  const rateBuckets = new Map<string, number[]>();
  function aiRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
    const key = `${req.ip || 'local'}:${req.path}`;
    const now = Date.now();
    const recent = (rateBuckets.get(key) ?? []).filter((ts) => now - ts < 60_000);
    if (recent.length >= 30) {
      return res.status(429).json({ error: 'Rate limit exceeded. Wait a few seconds before sending another AI request.' });
    }
    recent.push(now);
    rateBuckets.set(key, recent);
    next();
  }

  app.use(['/api/assistant', '/api/voice', '/api/vision', '/api/browser'], aiRateLimit);

  let cachedAiHealth: {
    checkedAt: number;
    status: Awaited<ReturnType<typeof checkAiHealth>>;
  } | null = null;

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: false,
      localEngineReady: true,
      cognitiveEngineReady: true,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/health/ai', async (req, res) => {
    const forceRefresh = req.query.refresh === '1';
    const now = Date.now();
    if (!forceRefresh && cachedAiHealth && now - cachedAiHealth.checkedAt < 30_000) {
      return res.json(cachedAiHealth.status);
    }
    const db = loadDb();
    const status = await checkAiHealth(db.settings.aiModel);
    cachedAiHealth = { checkedAt: now, status };
    res.json(status);
  });

  app.get('/api/diagnostics/latency', (_req, res) => {
    res.json({ timings: getRecentPipelineTimings() });
  });

  app.get('/api/bootstrap', async (_req, res) => {
    try {
      const db = loadDb();
      const checkedApps = await detectInstalledApps(db.apps);
      db.apps = checkedApps;
      saveDb(db);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/telemetry', async (_req, res) => {
    try {
      const telemetry = await getSystemTelemetry();
      res.json(telemetry);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/system/processes', async (_req, res) => {
    try {
      const processes = await getTopProcesses(12);
      res.json({ processes });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/diagnostics/audit', async (_req, res) => {
    try {
      const audit = await getWindowsCompatibilityAudit();
      res.json(audit);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/diagnostics/run', async (req, res) => {
    try {
      const report = await runSafeDiagnosticsSuite();
      if (req.body?.saveReport !== false) {
        writeTestReportFile(report);
      }
      const db = loadDb();
      appendActionLog(db, {
        agent: 'system',
        action: 'Run Safe Diagnostics Suite',
        target: `${report.summary.pass}/${report.summary.total} Passed`,
        status: report.summary.fail > 0 ? 'failed' : 'completed',
        detail: `${report.summary.warning} warning, ${report.summary.unavailable} unavailable`,
      });
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/diagnostics/report', async (_req, res) => {
    try {
      const report = await runSafeDiagnosticsSuite();
      writeTestReportFile(report);
      const md = formatTestReportMarkdown(report);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="TEST_REPORT.md"');
      res.send(md);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/settings/export', (_req, res) => {
    const db = loadDb();
    const safeExport = {
      exportedAt: new Date().toISOString(),
      settings: db.settings,
      memory: db.memory,
      workflows: db.workflows,
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="friday-settings-backup.json"');
    res.send(JSON.stringify(safeExport, null, 2));
  });

  app.get('/api/weather', async (req, res) => {
    try {
      const db = loadDb();
      const forceRefresh = req.query.refresh === '1';
      const latRaw = req.query.lat !== undefined ? Number(req.query.lat) : NaN;
      const lonRaw = req.query.lon !== undefined ? Number(req.query.lon) : NaN;
      if (
        Number.isFinite(latRaw) &&
        Number.isFinite(lonRaw) &&
        latRaw >= -90 &&
        latRaw <= 90 &&
        lonRaw >= -180 &&
        lonRaw <= 180
      ) {
        const label = typeof req.query.label === 'string' ? req.query.label : undefined;
        const weather = await getWeatherForCoordinates(latRaw, lonRaw, label, forceRefresh);
        return res.json(weather);
      }
      const loc = (req.query.location as string) || db.settings.weatherLocation;
      const weather = await getWeatherForLocation(loc, forceRefresh);
      res.json(weather);
    } catch (err) {
      res.status(502).json({ error: `Weather service unavailable: ${(err as Error).message}` });
    }
  });

  app.get('/api/weather/search', async (req, res) => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (q.length < 2) return res.json({ results: [] });
      const results = await searchWeatherLocations(q);
      res.json({ results });
    } catch (err) {
      res.status(502).json({ error: `Location search unavailable: ${(err as Error).message}` });
    }
  });

  app.get('/api/files', (req, res) => {
    try {
      const db = loadDb();
      const query = String(req.query.q ?? '');
      const category = String(req.query.category ?? 'all') as
        | 'all'
        | 'document'
        | 'code'
        | 'image'
        | 'video'
        | 'audio'
        | 'spreadsheet'
        | 'presentation'
        | 'other';
      const indexed = getPersistedOrIndexedFiles(db.settings.allowedFolders, db.settings.pausedIndexing, 1500);
      let progress = getFileIndexProgress(db.settings.allowedFolders, db.settings.pausedIndexing);
      if (
        !db.settings.pausedIndexing &&
        db.settings.allowedFolders.length > 0 &&
        indexed.length === 0 &&
        progress.status !== 'indexing' &&
        progress.status !== 'completed'
      ) {
        void startBackgroundFileIndexing(db.settings.allowedFolders);
        progress = getFileIndexProgress(db.settings.allowedFolders, db.settings.pausedIndexing);
      }
      const matches = searchIndexedFiles(indexed, query, category);
      const duplicates = findDuplicateGroups(indexed);
      res.json({
        status: progress.status,
        progress,
        folderStatuses: progress.folderStatuses,
        paused: db.settings.pausedIndexing,
        allowedFolders: db.settings.allowedFolders,
        totalIndexed: indexed.length,
        files: matches,
        duplicates,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/files/status', (_req, res) => {
    try {
      const db = loadDb();
      const progress = getFileIndexProgress(db.settings.allowedFolders, db.settings.pausedIndexing);
      res.json({
        ...progress,
        allowedFolders: db.settings.allowedFolders,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/reindex', async (_req, res) => {
    try {
      const db = loadDb();
      if (db.settings.pausedIndexing) {
        db.settings.pausedIndexing = false;
        saveDb(db);
      }
      const progress = await startBackgroundFileIndexing(db.settings.allowedFolders, { force: true });
      res.json({ started: true, progress });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/pause', (_req, res) => {
    try {
      const db = loadDb();
      db.settings.pausedIndexing = true;
      saveDb(db);
      pauseFileIndexing();
      const progress = getFileIndexProgress(db.settings.allowedFolders, true);
      res.json({ paused: true, progress });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/resume', async (_req, res) => {
    try {
      const db = loadDb();
      db.settings.pausedIndexing = false;
      saveDb(db);
      const progress = await resumeFileIndexing(db.settings.allowedFolders);
      res.json({ paused: false, progress });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/cancel', (_req, res) => {
    try {
      cancelFileIndexing();
      const db = loadDb();
      const progress = getFileIndexProgress(db.settings.allowedFolders, db.settings.pausedIndexing);
      res.json({ cancelled: true, progress });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/folders', async (req, res) => {
    try {
      const { folderPath } = req.body as { folderPath?: string };
      if (!folderPath || !folderPath.trim()) {
        return res.status(400).json({ error: 'folderPath is required.' });
      }
      const check = validateAndNormalizeFolder(folderPath);
      if (!check.ok) {
        return res.status(check.exists ? 403 : 400).json({
          error: check.error || 'Selected folder is invalid or inaccessible.',
        });
      }
      const db = loadDb();
      const existsAlready = db.settings.allowedFolders.some((f) =>
        process.platform === 'win32'
          ? path.resolve(f).toLowerCase() === check.path.toLowerCase()
          : path.resolve(f) === check.path
      );
      if (!existsAlready) {
        db.settings.allowedFolders = [...db.settings.allowedFolders, check.path];
        saveDb(db);
        appendActionLog(db, {
          agent: 'file',
          action: 'Grant Permitted Folder Access',
          target: check.path,
          status: 'completed',
        });
      }
      invalidateFileIndexCache();
      let progress = getFileIndexProgress(db.settings.allowedFolders, db.settings.pausedIndexing);
      if (!db.settings.pausedIndexing) {
        progress = await startBackgroundFileIndexing(db.settings.allowedFolders, { force: true });
      }
      res.json({
        added: !existsAlready,
        folder: check.path,
        allowedFolders: db.settings.allowedFolders,
        progress,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/files/folders', (req, res) => {
    try {
      const rawFolder = String((req.body as { folderPath?: string })?.folderPath || req.query.folderPath || '');
      if (!rawFolder.trim()) {
        return res.status(400).json({ error: 'folderPath is required.' });
      }
      const resolvedTarget = path.resolve(rawFolder.trim());
      const db = loadDb();
      const nextFolders = db.settings.allowedFolders.filter((f) =>
        process.platform === 'win32'
          ? path.resolve(f).toLowerCase() !== resolvedTarget.toLowerCase()
          : path.resolve(f) !== resolvedTarget
      );
      db.settings.allowedFolders = nextFolders;
      saveDb(db);
      removePermittedFolderFromIndex(resolvedTarget);
      if (nextFolders.length === 0) {
        cancelFileIndexing();
      }
      appendActionLog(db, {
        agent: 'file',
        action: 'Revoke Permitted Folder Access',
        target: resolvedTarget,
        status: 'completed',
      });
      const progress = getFileIndexProgress(nextFolders, db.settings.pausedIndexing);
      res.json({
        removed: true,
        allowedFolders: nextFolders,
        progress,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/read', async (req, res) => {
    try {
      const { filePath } = req.body as { filePath?: string };
      if (!filePath) {
        return res.status(400).json({ error: 'filePath is required' });
      }
      const db = loadDb();
      const preview = await readPermittedFilePreview(filePath, db.settings.allowedFolders);
      appendActionLog(db, {
        agent: 'file',
        action: 'Preview Local File',
        target: preview.name,
        status: 'completed',
      });
      res.json(preview);
    } catch (err) {
      res.status(403).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/open', async (req, res) => {
    try {
      const { filePath } = req.body as { filePath?: string };
      if (!filePath) return res.status(400).json({ error: 'filePath is required' });
      const db = loadDb();
      const resolved = path.resolve(filePath);
      if (!isPathPermitted(resolved, db.settings.allowedFolders)) {
        return res.status(403).json({ error: 'Access denied: file is outside user-permitted folders.' });
      }
      if (!fs.existsSync(resolved)) {
        return res.status(404).json({ error: 'File not found.' });
      }
      const result = await openLocalPathInDefaultApp(resolved);
      appendActionLog(db, {
        agent: 'file',
        action: 'Open Local File in Default App',
        target: path.basename(resolved),
        status: result.opened ? 'completed' : 'blocked',
        detail: result.detail,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/reveal', async (req, res) => {
    try {
      const { filePath } = req.body as { filePath?: string };
      if (!filePath) return res.status(400).json({ error: 'filePath is required' });
      const db = loadDb();
      const resolved = path.resolve(filePath);
      if (!isPathPermitted(resolved, db.settings.allowedFolders)) {
        return res.status(403).json({ error: 'Access denied: file is outside user-permitted folders.' });
      }
      if (!fs.existsSync(resolved)) {
        return res.status(404).json({ error: 'File not found.' });
      }
      const result = await revealFileInWindowsExplorer(resolved, db.settings.allowedFolders);
      appendActionLog(db, {
        agent: 'file',
        action: 'Reveal File Location',
        target: path.basename(resolved),
        status: result.revealed ? 'completed' : 'blocked',
        detail: result.message,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/files/stream', (req, res) => {
    try {
      const rawPath = String(req.query.path ?? '');
      if (!rawPath) return res.status(400).json({ error: 'path query parameter is required' });
      const db = loadDb();
      const resolved = path.resolve(rawPath);
      if (!isPathPermitted(resolved, db.settings.allowedFolders)) {
        return res.status(403).json({ error: 'Access denied: file is outside permitted directories.' });
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        return res.status(404).json({ error: 'File not found.' });
      }
      res.sendFile(resolved);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/folder', (req, res) => {
    try {
      const { parentFolder, folderName, folderPath, confirmCreate } = req.body as {
        parentFolder?: string;
        folderName?: string;
        folderPath?: string;
        confirmCreate?: boolean;
      };
      if (!confirmCreate) {
        return res.status(400).json({ error: 'Explicit confirmation is required to create a folder.' });
      }
      const db = loadDb();
      let targetParent = parentFolder?.trim() || '';
      let targetName = folderName?.trim() || '';
      if ((!targetParent || !targetName) && folderPath?.trim()) {
        const resolvedLegacy = path.resolve(folderPath.trim());
        targetParent = path.dirname(resolvedLegacy);
        targetName = path.basename(resolvedLegacy);
      }
      if (!targetParent || !targetName) {
        return res.status(400).json({ error: 'Select a parent folder and enter a folder name.' });
      }
      const outcome = createPermittedFolder({
        parentFolder: targetParent,
        folderName: targetName,
        allowedFolders: db.settings.allowedFolders,
      });
      if (!outcome.created) {
        return res.status(outcome.statusCode).json({
          created: false,
          conflict: Boolean(outcome.conflict),
          path: outcome.path,
          error: outcome.error,
        });
      }
      appendActionLog(db, {
        agent: 'file',
        action: 'Create Directory',
        target: outcome.path || targetName,
        status: 'completed',
      });
      if (!db.settings.pausedIndexing) {
        void startBackgroundFileIndexing(db.settings.allowedFolders, { force: true });
      }
      res.json({ created: true, path: outcome.path });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/assistant/command', async (req, res) => {
    try {
      const { command } = req.body as { command?: string };
      if (!command || !command.trim()) {
        return res.status(400).json({ error: 'Command text is required.' });
      }
      const db = loadDb();
      const result = await runAssistantCommand(command.trim(), db.settings);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/assistant/stream', async (req, res) => {
    const { command } = req.body as { command?: string };
    if (!command || !command.trim()) {
      return res.status(400).json({ error: 'Command text is required.' });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const controller = new AbortController();
    let closed = false;
    res.on('close', () => {
      closed = true;
      controller.abort();
    });

    try {
      const db = loadDb();
      await streamAssistantCommand(
        command.trim(),
        db.settings,
        (ev) => {
          if (!closed) {
            res.write(`data: ${JSON.stringify(ev)}\n\n`);
          }
        },
        controller.signal
      );
    } catch (err) {
      if (!closed && (err as Error).name !== 'AbortError') {
        res.write(`data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`);
      }
    } finally {
      if (!closed) {
        res.end();
      }
    }
  });

  app.post('/api/assistant/confirm', async (req, res) => {
    try {
      const { actionType, summary, approved, payload } = req.body as {
        actionType: string;
        summary: string;
        approved: boolean;
        payload?: Record<string, unknown>;
      };
      const db = loadDb();
      const automationTaskId =
        typeof payload?.automationTaskId === 'string' && payload.automationTaskId.trim()
          ? payload.automationTaskId.trim()
          : '';

      if (!approved) {
        if (automationTaskId) {
          await automationTaskManager.cancelTask(automationTaskId);
        }
        appendActionLog(db, {
          agent: 'automation',
          action: 'Action Cancelled by User',
          target: summary.slice(0, 48),
          status: 'blocked',
        });
        const msg = {
          id: `msg-${Date.now()}-a`,
          role: 'assistant' as const,
          content: 'Understood. I cancelled the pending operation and made no changes.',
          timestamp: new Date().toISOString(),
          intent: actionType,
        };
        db.chatHistory = [...db.chatHistory, msg].slice(-100);
        saveDb(db);
        return res.json({ message: msg });
      }

      if (automationTaskId) {
        await automationTaskManager.resumeTask(automationTaskId, true);
        // Wait briefly for quick local workflows to finish so chat confirmation shows verified output
        let currentTask = automationTaskManager.getTask(automationTaskId);
        const deadline = Date.now() + 4500;
        while (
          currentTask &&
          (currentTask.state === 'pending' || currentTask.state === 'running' || currentTask.state === 'verifying' || currentTask.state === 'retrying') &&
          Date.now() < deadline
        ) {
          await new Promise((r) => setTimeout(r, 80));
          currentTask = automationTaskManager.getTask(automationTaskId);
        }
        const msg = {
          id: `msg-${Date.now()}-a`,
          role: 'assistant' as const,
          content:
            currentTask?.summary ||
            `Approved and started workflow "${summary}" (state: ${currentTask?.state || 'running'}).`,
          timestamp: new Date().toISOString(),
          intent: 'workflow_run',
          steps: currentTask?.steps.map((s) => ({
            id: s.stepId,
            agent: 'automation' as const,
            title: s.title,
            status:
              s.status === 'completed'
                ? ('completed' as const)
                : s.status === 'failed' || s.status === 'cancelled'
                  ? ('failed' as const)
                  : s.status === 'running' || s.status === 'retrying'
                    ? ('running' as const)
                    : ('pending' as const),
            detail: s.verificationDetail || s.output || s.error,
          })),
          sources: currentTask?.sources.length ? currentTask.sources : undefined,
        };
        const freshDb = loadDb();
        freshDb.chatHistory = [...freshDb.chatHistory, msg].slice(-120);
        saveDb(freshDb);
        return res.json({ message: msg, task: currentTask });
      }

      if (actionType === 'calendar_schedule') {
        const evt: CalendarEvent = {
          id: `evt-${Date.now()}`,
          title: summary.replace(/^(friday,?\s*)?(schedule|create|book|add)\s*/i, '').trim() || 'Scheduled Event',
          date: new Date().toISOString().slice(0, 10),
          time: '15:00',
          category: 'meeting',
          completed: false,
          createdAt: new Date().toISOString(),
        };
        db.calendar.unshift(evt);
        appendActionLog(db, {
          agent: 'calendar',
          action: 'Confirmed & Scheduled Event',
          target: evt.title,
          status: 'completed',
        });
        const msg = {
          id: `msg-${Date.now()}-a`,
          role: 'assistant' as const,
          content: `Confirmed. Added "${evt.title}" to your calendar for ${evt.date} at ${evt.time}.`,
          timestamp: new Date().toISOString(),
          intent: actionType,
        };
        db.chatHistory = [...db.chatHistory, msg].slice(-100);
        saveDb(db);
        return res.json({ message: msg, calendarEvent: evt });
      }

      if (actionType === 'sensitive_action' && /\b(close|kill|terminate)\s+/i.test(summary)) {
        const closeRes = await closeWindowSafe(summary);
        appendActionLog(db, {
          agent: 'application',
          action: closeRes.closed ? 'Closed Window' : 'Window Close Check',
          target: summary.slice(0, 48),
          status: closeRes.closed ? 'completed' : 'blocked',
          detail: closeRes.detail,
        });
        const msg = {
          id: `msg-${Date.now()}-a`,
          role: 'assistant' as const,
          content: closeRes.detail,
          timestamp: new Date().toISOString(),
          intent: actionType,
        };
        db.chatHistory = [...db.chatHistory, msg].slice(-100);
        saveDb(db);
        return res.json({ message: msg });
      }

      if (actionType === 'sensitive_action' && /\bcreate\s+(?:a\s+)?(?:new\s+)?folder\s+([a-zA-Z0-9._-]+)/i.test(summary)) {
        const match = summary.match(/\bcreate\s+(?:a\s+)?(?:new\s+)?folder\s+([a-zA-Z0-9._-]+)/i);
        const folderName = match?.[1]?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'NewFolder';
        const base = db.settings.allowedFolders[0] || process.cwd();
        const target = path.resolve(base, folderName);
        if (!isPathPermitted(target, db.settings.allowedFolders)) {
          return res.status(403).json({ error: 'Target folder outside permitted workspace.' });
        }
        fs.mkdirSync(target, { recursive: true });
        invalidateFileIndexCache();
        appendActionLog(db, {
          agent: 'file',
          action: 'Create Permitted Folder',
          target: folderName,
          status: 'completed',
        });
        const msg = {
          id: `msg-${Date.now()}-a`,
          role: 'assistant' as const,
          content: `Confirmed. Created folder "${target}".`,
          timestamp: new Date().toISOString(),
          intent: actionType,
        };
        db.chatHistory = [...db.chatHistory, msg].slice(-100);
        saveDb(db);
        return res.json({ message: msg });
      }

      const goalCommand =
        typeof payload?.goal === 'string' && payload.goal.trim()
          ? payload.goal.trim()
          : typeof payload?.originalCommand === 'string' && payload.originalCommand.trim()
            ? payload.originalCommand.trim()
            : '';

      if (goalCommand) {
        const cogConfirm = await runCognitiveTurn({
          command: goalCommand,
          confirmedAction: true,
        });
        appendActionLog(db, {
          agent: cogConfirm.agents[0] || 'automation',
          action: `Confirmed Cognitive Plan (${cogConfirm.intentId})`,
          target: goalCommand.slice(0, 48),
          status: 'completed',
          detail: 'User approved cognitive task plan execution',
        });
        const msg = {
          id: `msg-${Date.now()}-a`,
          role: 'assistant' as const,
          content: cogConfirm.reply,
          timestamp: new Date().toISOString(),
          intent: cogConfirm.intentId,
          steps: cogConfirm.steps,
        };
        const freshDb = loadDb();
        freshDb.chatHistory = [...freshDb.chatHistory, msg].slice(-100);
        saveDb(freshDb);
        return res.json({ message: msg });
      }

      appendActionLog(db, {
        agent: 'automation',
        action: 'Confirmed Safe Execution',
        target: summary.slice(0, 48),
        status: 'completed',
        detail: 'User-approved safety gate recorded',
      });
      const msg = {
        id: `msg-${Date.now()}-a`,
        role: 'assistant' as const,
        content: `Confirmed: "${summary}". Safety check passed and action has been logged to your audit history.`,
        timestamp: new Date().toISOString(),
        intent: actionType,
      };
      db.chatHistory = [...db.chatHistory, msg].slice(-100);
      saveDb(db);
      res.json({ message: msg });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // OpenJarvis Architecture & Agent Endpoints
  app.get('/api/openjarvis/status', (_req, res) => {
    try {
      const hardware = profileSystemHardware();
      const models = getOpenJarvisModelCatalog(hardware);
      const agents = defaultOpenJarvisOrchestrator.listAgents();
      const recentTraces = defaultTraceRecorder.getRecentTraces(10);
      res.json({
        enabled: true,
        version: '1.0.0',
        hardware,
        models,
        agents,
        recentTraces,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/openjarvis/models', (_req, res) => {
    try {
      const models = defaultOpenJarvisOrchestrator.getModelCatalog();
      res.json({ models });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/openjarvis/models/download', async (req, res) => {
    try {
      const { modelId } = req.body as { modelId: string };
      if (!modelId) {
        return res.status(400).json({ error: 'modelId is required.' });
      }
      startSafeModelDownload(modelId).catch(() => {});
      const status = getDownloadStatus(modelId);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/openjarvis/models/download/status/:modelId', (req, res) => {
    try {
      const status = getDownloadStatus(req.params.modelId);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/openjarvis/models/download/cancel', async (req, res) => {
    try {
      const { modelId } = req.body as { modelId: string };
      const cancelled = await cancelModelDownload(modelId);
      res.json({ cancelled });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/openjarvis/execute', async (req, res) => {
    try {
      const { command, confirmed } = req.body as { command: string; confirmed?: boolean };
      if (!command || !command.trim()) {
        return res.status(400).json({ error: 'command is required.' });
      }
      const result = await defaultOpenJarvisOrchestrator.processCommand(command, Boolean(confirmed));
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/openjarvis/traces', (_req, res) => {
    try {
      const traces = defaultTraceRecorder.getRecentTraces(30);
      res.json({ traces });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/openjarvis/traces/feedback', (req, res) => {
    try {
      const { traceId, originalCommand, correctedIntent, reason } = req.body as {
        traceId: string;
        originalCommand: string;
        correctedIntent: string;
        reason: string;
      };
      defaultTraceRecorder.recordCorrection(traceId, originalCommand, correctedIntent, reason);
      res.json({ recorded: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/summarize', async (req, res) => {
    try {
      const { filePath, question } = req.body as { filePath?: string; question?: string };
      if (!filePath) return res.status(400).json({ error: 'filePath is required' });
      const db = loadDb();
      const preview = await readPermittedFilePreview(filePath, db.settings.allowedFolders);
      const result = await summarizeLocalFile({
        fileName: preview.name,
        content: preview.content,
        question,
        model: db.settings.aiModel,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/browser/research', async (req, res) => {
    try {
      const { query, url, mode } = req.body as {
        query?: string;
        url?: string;
        mode?: 'web' | 'news' | 'docs' | 'video';
      };
      if (!query?.trim() && !url?.trim()) {
        return res.status(400).json({ error: 'A search query or URL is required.' });
      }
      const db = loadDb();
      const result = await runBrowserResearch(query?.trim() || '', url?.trim(), db.settings.aiModel, mode || 'web');
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/calendar/briefing', async (_req, res) => {
    try {
      const db = loadDb();
      const result = await generateDailyBriefing(db.settings.aiModel);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/vision/analyze', async (req, res) => {
    try {
      const body = req.body as Partial<VisualAnalysisRequest> & { prompt?: string };
      const { base64Data, mimeType, operationType, fileName, customPrompt, prompt, metadata } = body;

      if (!base64Data || !mimeType) {
        return res.status(400).json({ error: 'Media payload (base64Data and mimeType) is required.' });
      }

      // Determine explicit operation type strictly (prevent function mixing)
      let resolvedOp = operationType;
      if (!resolvedOp) {
        if (mimeType === 'application/pdf') resolvedOp = 'pdf_analysis';
        else if (mimeType.startsWith('audio/')) resolvedOp = 'audio_analysis';
        else resolvedOp = 'image_analysis';
      }

      const db = loadDb();
      const result = await performVisualAnalysis({
        operationType: resolvedOp,
        base64Data,
        mimeType,
        fileName,
        customPrompt: customPrompt || prompt || '',
        metadata,
      });

      appendActionLog(db, {
        agent: resolvedOp === 'audio_analysis' || resolvedOp === 'pdf_analysis' ? 'media' : 'vision',
        action: `Visual Engine: ${resolvedOp}`,
        target: fileName || metadata?.sourceName || mimeType,
        status: result.success ? 'completed' : 'failed',
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/voice/tts', async (req, res) => {
    try {
      const { text, voiceName } = req.body as { text?: string; voiceName?: string };
      if (!text?.trim()) {
        return res.status(400).json({ error: 'text is required' });
      }
      const db = loadDb();
      const tts = await synthesizeSpeechWav(text.trim(), voiceName || db.settings.voiceName);
      res.json({
        audioBase64: tts.audioBase64,
        mimeType: tts.audioBase64 ? 'audio/wav' : null,
        localFallback: tts.localFallback,
        reason: tts.reason,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/voice/transcribe', async (req, res) => {
    try {
      const { base64Data, mimeType, language } = req.body as {
        base64Data?: string;
        mimeType?: string;
        language?: string;
      };
      if (!base64Data) {
        return res.status(400).json({ error: 'base64Data is required' });
      }
      const result = await transcribeAudioBase64(
        base64Data,
        mimeType || 'audio/webm',
        language || 'en-US'
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/diagnostics/voice', async (_req, res) => {
    try {
      const [caps, speechReport] = await Promise.all([
        getWindowsSpeechCapabilities(),
        defaultSpeechProvider.getCapabilities(),
      ]);
      res.json({
        ...caps,
        cognitiveSpeech: speechReport,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/apps/open-folder', async (req, res) => {
    try {
      const { folder } = req.body as { folder?: string };
      if (!folder) return res.status(400).json({ error: 'folder is required' });
      const db = loadDb();
      const result = await openWindowsFolder(folder, db.settings.allowedFolders);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/apps/open-website', async (req, res) => {
    try {
      const { url, browser } = req.body as { url?: string; browser?: 'chrome' | 'edge' };
      if (!url) return res.status(400).json({ error: 'url is required' });
      const result = await openWindowsWebsite(url, browser);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/apps/windows', async (_req, res) => {
    try {
      const windows = await listActiveWindows();
      res.json({ windows, platform: process.platform });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/apps/window-action', async (req, res) => {
    try {
      const { processName, action, confirmed } = req.body as {
        processName?: string;
        action?: 'focus' | 'minimize' | 'maximize' | 'close';
        confirmed?: boolean;
      };
      if (!processName || !action) {
        return res.status(400).json({ error: 'processName and action are required.' });
      }
      const db = loadDb();
      if (action === 'close') {
        if (!confirmed) {
          return res.status(400).json({ error: 'Explicit confirmation is required before closing a window.' });
        }
        const closeRes = await closeWindowsWindow(processName);
        appendActionLog(db, {
          agent: 'application',
          action: 'Close Desktop Window',
          target: processName,
          status: closeRes.closed ? 'completed' : 'blocked',
          detail: closeRes.detail,
        });
        return res.json(closeRes);
      }
      if (action === 'focus') {
        const ok = await focusWindowsWindow(processName);
        return res.json({ ok, detail: ok ? `Focused ${processName}` : `Window "${processName}" not found.` });
      }
      if (action === 'minimize' || action === 'maximize') {
        const ok = await setWindowsWindowState(processName, action);
        return res.json({ ok, detail: ok ? `${action}d ${processName}` : `Window "${processName}" not found.` });
      }
      res.status(400).json({ error: 'Unsupported window action.' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/media/control', async (req, res) => {
    try {
      const { action } = req.body as { action?: MediaControlAction };
      const allowed = new Set<MediaControlAction>([
        'play_pause',
        'next',
        'previous',
        'volume_up',
        'volume_down',
        'mute',
      ]);
      if (!action || !allowed.has(action)) {
        return res.status(400).json({ error: 'Invalid media control action.' });
      }
      const result = await sendWindowsMediaKey(action);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/apps/:id/launch', async (req, res) => {
    try {
      const db = loadDb();
      const target = db.apps.find((a) => a.id === req.params.id);
      if (!target) return res.status(404).json({ error: 'Application not found' });
      const result = await launchApplication(target);
      target.lastUsed = new Date().toISOString();
      appendActionLog(db, {
        agent: 'application',
        action: result.launched ? 'Launch App' : 'App Launch Requested',
        target: target.name,
        status: result.launched ? 'completed' : 'blocked',
        detail: result.message,
      });
      res.json({ app: target, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/apps/:id/pin', (req, res) => {
    const db = loadDb();
    const target = db.apps.find((a) => a.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Application not found' });
    target.pinned = !target.pinned;
    saveDb(db);
    res.json(target);
  });

  app.post('/api/apps/refresh', async (_req, res) => {
    try {
      const db = loadDb();
      db.apps = await detectInstalledApps(db.apps, true);
      saveDb(db);
      res.json({ apps: db.apps });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/calendar', (req, res) => {
    const { title, date, time, category, notes } = req.body as Partial<CalendarEvent>;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    const db = loadDb();
    const evt: CalendarEvent = {
      id: `evt-${Date.now()}`,
      title: title.trim(),
      date: date || new Date().toISOString().slice(0, 10),
      time: time || '12:00',
      category: category || 'task',
      completed: false,
      notes: notes?.trim(),
      createdAt: new Date().toISOString(),
    };
    db.calendar.unshift(evt);
    appendActionLog(db, {
      agent: 'calendar',
      action: 'Create Calendar Event',
      target: evt.title,
      status: 'completed',
    });
    res.json(evt);
  });

  app.patch('/api/calendar/:id', (req, res) => {
    const db = loadDb();
    const evt = db.calendar.find((e) => e.id === req.params.id);
    if (!evt) return res.status(404).json({ error: 'Event not found' });
    const patch = sanitizeCalendarPatch(req.body);
    Object.assign(evt, patch);
    saveDb(db);
    res.json(evt);
  });

  app.delete('/api/calendar/:id', (req, res) => {
    const db = loadDb();
    const before = db.calendar.length;
    db.calendar = db.calendar.filter((e) => e.id !== req.params.id);
    if (db.calendar.length === before) return res.status(404).json({ error: 'Event not found' });
    appendActionLog(db, {
      agent: 'calendar',
      action: 'Delete Calendar Event',
      target: req.params.id,
      status: 'completed',
    });
    res.json({ deleted: true });
  });

  app.post('/api/memory', (req, res) => {
    const { category, key, value } = req.body as Partial<MemoryItem>;
    if (!key?.trim() || !value?.trim()) {
      return res.status(400).json({ error: 'Memory key and value are required' });
    }
    const db = loadDb();
    const item: MemoryItem = {
      id: `mem-${Date.now()}`,
      category: category || 'preference',
      key: key.trim(),
      value: value.trim(),
      approved: true,
      updatedAt: new Date().toISOString(),
    };
    db.memory.unshift(item);
    appendActionLog(db, {
      agent: 'memory',
      action: 'Store Personal Memory',
      target: item.key,
      status: 'completed',
    });
    res.json(item);
  });

  app.patch('/api/memory/:id', (req, res) => {
    const db = loadDb();
    const item = db.memory.find((m) => m.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Memory item not found' });
    const patch = sanitizeMemoryPatch(req.body);
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
    saveDb(db);
    res.json(item);
  });

  app.delete('/api/memory/:id', (req, res) => {
    const db = loadDb();
    db.memory = db.memory.filter((m) => m.id !== req.params.id);
    appendActionLog(db, {
      agent: 'memory',
      action: 'Delete Memory Entry',
      target: req.params.id,
      status: 'completed',
    });
    res.json({ deleted: true });
  });

  app.post('/api/workflows/:id/run', async (req, res) => {
    try {
      const db = loadDb();
      const wf = db.workflows.find((w) => w.id === req.params.id);
      if (!wf) return res.status(404).json({ error: 'Workflow not found' });
      wf.runCount += 1;
      wf.lastRunAt = new Date().toISOString();
      saveDb(db);
      const result = await runAssistantCommand(wf.triggerPhrase, db.settings);
      res.json({ workflow: wf, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/workflows', (req, res) => {
    const { name, description, triggerPhrase } = req.body as {
      name?: string;
      description?: string;
      triggerPhrase?: string;
    };
    if (!name?.trim() || !triggerPhrase?.trim()) {
      return res.status(400).json({ error: 'Workflow name and trigger phrase are required.' });
    }
    const db = loadDb();
    const wf = {
      id: `wf-${Date.now()}`,
      name: name.trim(),
      description: description?.trim() || 'Custom multi-agent automation workflow',
      triggerPhrase: triggerPhrase.trim(),
      steps: [
        { agent: 'core' as const, action: 'Parse workflow intent' },
        { agent: 'automation' as const, action: triggerPhrase.trim() },
      ],
      enabled: true,
      runCount: 0,
    };
    db.workflows.unshift(wf);
    saveDb(db);
    res.json(wf);
  });

  app.patch('/api/settings', (req, res) => {
    const db = loadDb();
    db.settings = sanitizeSettingsPatch(req.body, db.settings);
    const pref = getPreferenceProfile();
    if (typeof db.settings.optInDatasetCollection === 'boolean') {
      pref.optInDatasetCollection = db.settings.optInDatasetCollection;
    }
    if (db.settings.responseLanguagePreference) {
      pref.preferredLanguage =
        db.settings.responseLanguagePreference === 'hindi_simple'
          ? 'hindi'
          : db.settings.responseLanguagePreference;
      pref.preferredStyle =
        db.settings.responseLanguagePreference === 'hindi_simple'
          ? 'hindi_simple'
          : db.settings.responseLanguagePreference === 'hinglish'
            ? 'hinglish'
            : db.settings.responseLanguagePreference === 'english'
              ? 'english'
              : 'auto';
    }
    savePreferenceProfile(pref);
    cachedAiHealth = null;
    invalidateFileIndexCache();
    saveDb(db);
    if (req.body?.pausedIndexing === true) {
      pauseFileIndexing();
    } else if (
      (req.body?.pausedIndexing === false || Array.isArray(req.body?.allowedFolders)) &&
      !db.settings.pausedIndexing &&
      db.settings.allowedFolders.length > 0
    ) {
      void startBackgroundFileIndexing(db.settings.allowedFolders, { force: true });
    }
    res.json(db.settings);
  });

  app.get('/api/notes', (_req, res) => {
    const db = loadDb();
    res.json({ notes: db.notes });
  });

  app.post('/api/notes', (req, res) => {
    const { title, content, pinned } = req.body as Partial<NoteItem>;
    if (!title?.trim() && !content?.trim()) {
      return res.status(400).json({ error: 'Note title or content is required.' });
    }
    const nowIso = new Date().toISOString();
    const db = loadDb();
    const note: NoteItem = {
      id: `note-${Date.now()}`,
      title: (title?.trim() || content?.trim().slice(0, 48) || 'Quick Note').slice(0, 140),
      content: (content?.trim() || title?.trim() || '').slice(0, 4000),
      pinned: Boolean(pinned),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.notes.unshift(note);
    appendActionLog(db, {
      agent: 'memory',
      action: 'Create Note',
      target: note.title,
      status: 'completed',
    });
    res.json(note);
  });

  app.patch('/api/notes/:id', (req, res) => {
    const db = loadDb();
    const note = db.notes.find((n) => n.id === req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    const patch = sanitizeNotePatch(req.body);
    Object.assign(note, patch, { updatedAt: new Date().toISOString() });
    saveDb(db);
    res.json(note);
  });

  app.delete('/api/notes/:id', (req, res) => {
    const db = loadDb();
    const before = db.notes.length;
    db.notes = db.notes.filter((n) => n.id !== req.params.id);
    if (db.notes.length === before) return res.status(404).json({ error: 'Note not found' });
    saveDb(db);
    res.json({ deleted: true });
  });

  app.get('/api/todos', (_req, res) => {
    const db = loadDb();
    res.json({ todos: db.todos });
  });

  app.post('/api/todos', (req, res) => {
    const { title, priority, dueDate } = req.body as Partial<TodoItem>;
    if (!title?.trim()) {
      return res.status(400).json({ error: 'Task title is required.' });
    }
    const db = loadDb();
    const todo: TodoItem = {
      id: `todo-${Date.now()}`,
      title: title.trim().slice(0, 200),
      completed: false,
      priority: priority === 'low' || priority === 'high' ? priority : 'normal',
      dueDate: typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : undefined,
      createdAt: new Date().toISOString(),
    };
    db.todos.unshift(todo);
    appendActionLog(db, {
      agent: 'calendar',
      action: 'Create Task',
      target: todo.title,
      status: 'completed',
    });
    res.json(todo);
  });

  app.patch('/api/todos/:id', (req, res) => {
    const db = loadDb();
    const todo = db.todos.find((t) => t.id === req.params.id);
    if (!todo) return res.status(404).json({ error: 'Task not found' });
    const patch = sanitizeTodoPatch(req.body);
    Object.assign(todo, patch);
    saveDb(db);
    res.json(todo);
  });

  app.delete('/api/todos/:id', (req, res) => {
    const db = loadDb();
    const before = db.todos.length;
    db.todos = db.todos.filter((t) => t.id !== req.params.id);
    if (db.todos.length === before) return res.status(404).json({ error: 'Task not found' });
    saveDb(db);
    res.json({ deleted: true });
  });

  app.delete('/api/chat/:id', (req, res) => {
    const db = loadDb();
    const before = db.chatHistory.length;
    db.chatHistory = db.chatHistory.filter((m) => m.id !== req.params.id);
    if (db.chatHistory.length === before) return res.status(404).json({ error: 'Chat message not found' });
    saveDb(db);
    res.json({ deleted: true });
  });

  app.delete('/api/chat', (_req, res) => {
    const db = loadDb();
    db.chatHistory = [];
    saveDb(db);
    res.json({ cleared: true });
  });

  // ---------- F.R.I.D.A.Y. COGNITIVE ENGINE API ROUTES ----------
  app.get('/api/cognitive/status', async (_req, res) => {
    try {
      const db = loadDb();
      const [online, health, speechReport] = await Promise.all([
        checkNetworkOnline(),
        checkAiHealth(db.settings.aiModel),
        defaultSpeechProvider.getCapabilities(),
      ]);
      const orchestrator = getServerCognitiveOrchestrator();
      res.json({
        online,
        health,
        context: orchestrator.getContextState(),
        preferences: getPreferenceProfile(),
        speechCapabilities: speechReport,
        tokenizer: getSavedTokenizerArtifact(),
        recentPlans: listTaskPlans(10),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/cognitive/turn', async (req, res) => {
    try {
      const { command, confirmedAction, source } = req.body as {
        command?: string;
        confirmedAction?: boolean;
        source?: 'text' | 'voice';
      };
      if (!command?.trim()) return res.status(400).json({ error: 'command is required' });
      const result = await runCognitiveTurn({
        command: command.trim(),
        confirmedAction,
        source,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 6-Layer Memory Endpoints
  app.get('/api/cognitive/memory', (req, res) => {
    const layer = typeof req.query.layer === 'string' && req.query.layer !== 'all'
      ? (req.query.layer as MemoryLayer)
      : undefined;
    const query = typeof req.query.q === 'string' ? req.query.q : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const memories =
      query || category || layer
        ? searchCognitiveMemories({ query, layer, category, limit: 150 })
        : listCognitiveMemories(undefined, 200);
    res.json({ memories });
  });

  app.post('/api/cognitive/memory', (req, res) => {
    const { layer, category, key, value, tags, importance } = req.body as {
      layer?: MemoryLayer;
      category?: string;
      key?: string;
      value?: string;
      tags?: string[];
      importance?: number;
    };
    if (!key?.trim() || !value?.trim()) {
      return res.status(400).json({ error: 'key and value are required' });
    }
    const validLayers: MemoryLayer[] = ['working', 'short_term', 'long_term', 'episodic', 'semantic', 'procedural'];
    const targetLayer = validLayers.includes(layer as MemoryLayer) ? (layer as MemoryLayer) : 'long_term';
    const saved = saveCognitiveMemory({
      layer: targetLayer,
      category: category?.trim() || 'user',
      key: key.trim(),
      value: value.trim(),
      tags: Array.isArray(tags) ? tags : ['manual'],
      importance: typeof importance === 'number' ? importance : 0.8,
      confidence: 1.0,
      source: 'user_provided',
    });
    res.json({ memory: saved });
  });

  app.patch('/api/cognitive/memory/:id', (req, res) => {
    const updated = updateCognitiveMemory(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Cognitive memory not found' });
    res.json({ memory: updated });
  });

  app.delete('/api/cognitive/memory/:id', (req, res) => {
    const ok = deleteCognitiveMemory(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Cognitive memory not found' });
    res.json({ deleted: true });
  });

  app.get('/api/cognitive/memory/export', (_req, res) => {
    const json = exportCognitiveMemoriesJson();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="friday-cognitive-memory.json"');
    res.send(json);
  });

  app.post('/api/cognitive/memory/import', (req, res) => {
    const count = importCognitiveMemoriesJson(req.body);
    res.json({ imported: count });
  });

  // Dynamic Intents (Teach Custom Commands)
  app.get('/api/cognitive/intents', (_req, res) => {
    const registry = new DynamicIntentRegistry(listDynamicIntents());
    res.json({ intents: registry.getAllIntents() });
  });

  app.post('/api/cognitive/intents', (req, res) => {
    const { phrase, actionsText } = req.body as { phrase?: string; actionsText?: string };
    if (!phrase?.trim() || !actionsText?.trim()) {
      return res.status(400).json({ error: 'phrase and actionsText are required' });
    }
    const registry = new DynamicIntentRegistry(listDynamicIntents());
    const taught = registry.teachCustomIntent(phrase.trim(), actionsText.trim());
    saveDynamicIntent(taught);
    res.json({ intent: taught });
  });

  app.delete('/api/cognitive/intents/:id', (req, res) => {
    const ok = deleteDynamicIntent(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Custom intent not found or built-in' });
    res.json({ deleted: true });
  });

  // Knowledge Base
  app.get('/api/cognitive/knowledge', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      return res.json({ results: searchKnowledgeBase(q, 12), chunks: listKnowledgeChunks(100) });
    }
    res.json({ results: [], chunks: listKnowledgeChunks(120) });
  });

  app.post('/api/cognitive/knowledge', (req, res) => {
    const { action, title, content, tags } = req.body as {
      action?: 'reindex' | 'add_fact';
      title?: string;
      content?: string;
      tags?: string[];
    };
    const db = loadDb();
    if (action === 'reindex') {
      const idx = indexKnowledgeSources({
        allowedFolders: db.settings.allowedFolders,
        pausedIndexing: db.settings.pausedIndexing,
        notes: db.notes,
      });
      return res.json(idx);
    }
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'title and content are required' });
    }
    const chunk = addUserKnowledgeFact({ title, content, tags });
    res.json({ chunk });
  });

  // Learning Pipeline (L1-L6)
  app.get('/api/cognitive/learning', (_req, res) => {
    res.json({
      lexicon: listCustomLexicon(),
      corrections: listLearningCorrections(),
      preferences: getPreferenceProfile(),
      patterns: listTaskPatternSuggestions(),
      datasetCount: listTrainingDatasetSamples(2000).length,
      datasetPreview: listTrainingDatasetSamples(15),
      tokenizer: getSavedTokenizerArtifact(),
    });
  });

  app.get('/api/cognitive/learning/dataset.jsonl', (_req, res) => {
    const samples = listTrainingDatasetSamples(5000);
    const jsonl = formatTrainingDatasetJsonl(samples);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="friday-training-dataset.jsonl"');
    res.send(jsonl);
  });

  app.post('/api/cognitive/learning', (req, res) => {
    const body = req.body as {
      action?:
        | 'add_vocab'
        | 'accept_pattern'
        | 'dismiss_pattern'
        | 'toggle_dataset'
        | 'train_tokenizer'
        | 'add_sample';
      phrase?: string;
      canonical?: string;
      patternId?: string;
      enabled?: boolean;
      prompt?: string;
      response?: string;
      intentId?: string;
    };

    if (body.action === 'add_vocab' && body.phrase?.trim() && body.canonical?.trim()) {
      const current = listCustomLexicon();
      const entry = learnVocabularyTerm(current, body.phrase, body.canonical, 'hinglish', 'verb');
      saveLexiconEntry(entry);
      return res.json({ entry });
    }

    if ((body.action === 'accept_pattern' || body.action === 'dismiss_pattern') && body.patternId) {
      const all = listTaskPatternSuggestions();
      const pat = all.find((p) => p.id === body.patternId);
      if (!pat) return res.status(404).json({ error: 'Pattern not found' });
      pat.status = body.action === 'accept_pattern' ? 'accepted' : 'dismissed';
      saveTaskPatternSuggestion(pat);
      if (body.action === 'accept_pattern') {
        const registry = new DynamicIntentRegistry(listDynamicIntents());
        const taught = registry.teachCustomIntent(pat.suggestedTrigger, pat.steps.join(' and '));
        saveDynamicIntent(taught);
      }
      return res.json({ pattern: pat });
    }

    if (body.action === 'toggle_dataset') {
      const pref = getPreferenceProfile();
      pref.optInDatasetCollection = Boolean(body.enabled);
      savePreferenceProfile(pref);
      const db = loadDb();
      db.settings.optInDatasetCollection = pref.optInDatasetCollection;
      saveDb(db);
      return res.json({ preferences: pref });
    }

    if (body.action === 'add_sample' && body.prompt?.trim() && body.response?.trim()) {
      appendTrainingDatasetSample({
        id: `ds-${Date.now()}`,
        prompt: body.prompt.trim(),
        normalizedPrompt: body.prompt.trim().toLowerCase(),
        language: 'hinglish',
        intentId: body.intentId || 'intent.general',
        entities: { numbers: [] },
        response: body.response.trim(),
        qualityScore: 0.9,
        approved: true,
        createdAt: new Date().toISOString(),
      });
      return res.json({ count: listTrainingDatasetSamples(2000).length });
    }

    if (body.action === 'train_tokenizer') {
      const samples = listTrainingDatasetSamples(2000);
      const fallbackSamples =
        samples.length > 0
          ? samples
          : [
              {
                id: 'seed-1',
                prompt: 'Friday chrome kholo',
                normalizedPrompt: 'chrome kholo',
                language: 'hinglish' as const,
                intentId: 'intent.open_app',
                entities: { app: 'chrome', numbers: [] },
                response: 'Ho gaya, Google Chrome launch kar diya hai.',
                qualityScore: 0.95,
                approved: true,
                createdAt: new Date().toISOString(),
              },
              {
                id: 'seed-2',
                prompt: 'Kal ka weather check kar',
                normalizedPrompt: 'kal ka weather check kar',
                language: 'hinglish' as const,
                intentId: 'intent.weather_check',
                entities: { dateHint: 'tomorrow', numbers: [] },
                response: 'Kal ka mausam update check kar liya.',
                qualityScore: 0.95,
                approved: true,
                createdAt: new Date().toISOString(),
              },
              {
                id: 'seed-3',
                prompt: 'Thoda Hindi mein samjha',
                normalizedPrompt: 'thoda hindi mein samjha',
                language: 'hinglish' as const,
                intentId: 'intent.explain_hindi_simple',
                entities: { numbers: [] },
                response: 'Aasaan Hindi mein: yeh local cognitive engine bina cloud ke kaam karta hai.',
                qualityScore: 0.95,
                approved: true,
                createdAt: new Date().toISOString(),
              },
            ];
      const artifact = trainBpeStyleTokenizer(fallbackSamples);
      saveTokenizerArtifact(artifact);
      return res.json({ artifact });
    }

    return res.status(400).json({ error: 'Unsupported learning action' });
  });

  // ---------- F.R.I.D.A.Y. AUTONOMOUS WORKFLOW ORCHESTRATOR ROUTES ----------
  app.get('/api/automation/tasks', (_req, res) => {
    try {
      res.json({ tasks: automationTaskManager.listTasks(35) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/automation/plan', (req, res) => {
    try {
      const { goal, confirmed } = req.body as { goal?: string; confirmed?: boolean };
      if (!goal?.trim()) return res.status(400).json({ error: 'goal is required' });
      const plan = automationTaskManager.planWorkflow(goal.trim(), Boolean(confirmed));
      res.json({ plan });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/automation/execute', async (req, res) => {
    try {
      const { goal, confirmed, wait } = req.body as {
        goal?: string;
        confirmed?: boolean;
        wait?: boolean;
      };
      if (!goal?.trim()) return res.status(400).json({ error: 'goal is required' });
      const task = await automationTaskManager.createAndStartTask({
        goal: goal.trim(),
        confirmed: Boolean(confirmed),
        waitForCompletion: Boolean(wait),
      });
      res.json({ task });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/automation/tasks/:id/pause', async (req, res) => {
    try {
      const task = await automationTaskManager.pauseTask(req.params.id);
      if (!task) return res.status(404).json({ error: 'Background task not found' });
      res.json({ task });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/automation/tasks/:id/resume', async (req, res) => {
    try {
      const task = await automationTaskManager.resumeTask(req.params.id, Boolean(req.body?.confirmed));
      if (!task) return res.status(404).json({ error: 'Background task not found' });
      res.json({ task });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/automation/tasks/:id/cancel', async (req, res) => {
    try {
      const task = await automationTaskManager.cancelTask(req.params.id);
      if (!task) return res.status(404).json({ error: 'Background task not found' });
      res.json({ task });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/automation/preferences', (_req, res) => {
    try {
      res.json({ preferences: listWorkflowPreferences() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/automation/preferences', (req, res) => {
    try {
      const { key, label, value, category } = req.body as {
        key?: string;
        label?: string;
        value?: string;
        category?: 'folder' | 'browser' | 'editor' | 'office' | 'workflow';
      };
      if (!key?.trim() || !value?.trim()) {
        return res.status(400).json({ error: 'key and value are required' });
      }
      const allowedCats = new Set(['folder', 'browser', 'editor', 'office', 'workflow']);
      const safeCat = category && allowedCats.has(category) ? category : 'workflow';
      const saved = saveWorkflowPreference({
        key: key.trim().slice(0, 80),
        label: (label?.trim() || key.trim()).slice(0, 140),
        value: value.trim().slice(0, 500),
        category: safeCat,
      });
      if (safeCat === 'folder') {
        addApprovedExternalPath(value.trim());
      }
      res.json({ preference: saved });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/automation/preferences/:key', (req, res) => {
    try {
      const deleted = deleteWorkflowPreference(req.params.key);
      if (!deleted) return res.status(404).json({ error: 'Workflow preference not found' });
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/automation/plugins', (_req, res) => {
    try {
      res.json({ plugins: automationTaskManager.getRegistry().listPlugins() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/automation/plugins/:id/toggle', (req, res) => {
    try {
      const registry = automationTaskManager.getRegistry();
      const pluginId = req.params.id as Parameters<typeof registry.setEnabled>[0];
      const enabled = Boolean(req.body?.enabled);
      const ok = registry.setEnabled(pluginId, enabled);
      if (!ok) return res.status(404).json({ error: 'Automation plugin not found' });
      res.json({ plugin: registry.getPlugin(pluginId) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/automation/apps', (_req, res) => {
    try {
      res.json({ apps: automationTaskManager.getApplicationManager().getAllProfiles() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Vite middleware in development, static serve in production
  let viteServer: { close: () => Promise<void> } | null = null;
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    viteServer = vite;
    app.use(vite.middlewares);
  } else {
    const candidateDistDirs = [
      process.env.FRIDAY_DIST_DIR ? path.resolve(process.env.FRIDAY_DIST_DIR) : null,
      path.resolve(process.cwd(), 'dist'),
      path.resolve(import.meta.dirname || process.cwd(), '../dist'),
      path.resolve(import.meta.dirname || process.cwd(), 'dist'),
    ].filter((p): p is string => Boolean(p));
    const distPath =
      candidateDistDirs.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || candidateDistDirs[0];
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const listenHost = process.env.FRIDAY_EMBEDDED_IN_ELECTRON === '1' ? '127.0.0.1' : '0.0.0.0';
  const httpServer = await new Promise<import('http').Server>((resolve, reject) => {
    const srv = app.listen(PORT, listenHost, () => {
      console.log(`F.R.I.D.A.Y. Command Server active at http://localhost:${PORT}`);
      resolve(srv);
    });
    srv.once('error', (err) => {
      console.error('[F.R.I.D.A.Y. Server] HTTP listener error:', err);
      reject(err);
    });
  });

  // Warm non-blocking persistent file index in background on server start
  try {
    const initialDb = loadDb();
    if (!initialDb.settings.pausedIndexing && initialDb.settings.allowedFolders.length > 0) {
      void startBackgroundFileIndexing(initialDb.settings.allowedFolders);
    }
  } catch {
    // Non-fatal startup warm-index error
  }

  const shutdown = async () => {
    cancelFileIndexing();
    try {
      if (viteServer) await viteServer.close();
    } catch {
      // Ignore Vite close errors during shutdown
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    try {
      closeCognitiveSqlite();
    } catch {
      // Ignore SQLite close errors during shutdown
    }
  };

  if (process.env.FRIDAY_EMBEDDED_IN_ELECTRON !== '1') {
    process.on('SIGINT', () => {
      void shutdown().then(() => process.exit(0));
    });
    process.on('SIGTERM', () => {
      void shutdown().then(() => process.exit(0));
    });
  }

  return { port: PORT, close: shutdown };
}

process.on('unhandledRejection', (reason) => {
  console.error('[F.R.I.D.A.Y. Server] Unhandled promise rejection:', reason);
});

if (process.env.FRIDAY_EMBEDDED_IN_ELECTRON !== '1') {
  startServer().catch((err) => {
    console.error('[F.R.I.D.A.Y. Server] Fatal startup error:', err);
    process.exit(1);
  });
}
