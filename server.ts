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
  getCachedFileIndex,
  invalidateFileIndexCache,
  isPathPermitted,
  readPermittedFilePreview,
} from './server/fileService.ts';
import {
  analyzeMediaOrScreen,
  checkAiHealth,
  generateDailyBriefing,
  getRecentPipelineTimings,
  hasValidGeminiKey,
  runAssistantCommand,
  runBrowserResearch,
  streamAssistantCommand,
  summarizeLocalFile,
  synthesizeSpeechWav,
  transcribeAudioBase64,
} from './server/aiService.ts';
import {
  closeWindowsWindow,
  focusWindowsWindow,
  getWindowsSpeechCapabilities,
  listActiveWindows,
  openLocalPathInDefaultApp,
  openWindowsFolder,
  openWindowsWebsite,
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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

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
      hasApiKey: hasValidGeminiKey(),
      localEngineReady: true,
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
    const status = await checkAiHealth(db.settings.aiModel, db.settings.ollamaModel);
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
      const indexed = getCachedFileIndex(db.settings.allowedFolders, db.settings.pausedIndexing, 300);
      const matches = searchIndexedFiles(indexed, query, category);
      const duplicates = findDuplicateGroups(indexed);
      res.json({
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
      const { folderPath, confirmCreate } = req.body as { folderPath?: string; confirmCreate?: boolean };
      if (!folderPath) {
        return res.status(400).json({ error: 'folderPath is required' });
      }
      const db = loadDb();
      const resolved = path.resolve(folderPath);
      if (!isPathPermitted(resolved, db.settings.allowedFolders)) {
        return res.status(403).json({ error: 'Target folder is outside permitted workspace directories.' });
      }
      if (!confirmCreate) {
        return res.status(400).json({ error: 'Explicit confirmation is required to create a folder.' });
      }
      fs.mkdirSync(resolved, { recursive: true });
      invalidateFileIndexCache();
      appendActionLog(db, {
        agent: 'file',
        action: 'Create Directory',
        target: path.basename(resolved),
        status: 'completed',
      });
      res.json({ created: true, path: resolved });
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
      const { actionType, summary, approved } = req.body as {
        actionType: string;
        summary: string;
        approved: boolean;
      };
      const db = loadDb();
      if (!approved) {
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
      const { base64Data, mimeType, prompt } = req.body as {
        base64Data?: string;
        mimeType?: string;
        prompt?: string;
      };
      if (!base64Data || !mimeType) {
        return res.status(400).json({ error: 'Media payload (base64Data and mimeType) is required.' });
      }
      const db = loadDb();
      const result = await analyzeMediaOrScreen({
        base64Data,
        mimeType,
        prompt: prompt || '',
        model: db.settings.aiModel,
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
      const caps = await getWindowsSpeechCapabilities();
      res.json({
        ...caps,
        geminiSpeechAvailable: hasValidGeminiKey(),
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
    cachedAiHealth = null;
    invalidateFileIndexCache();
    saveDb(db);
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

  // Vite middleware in development, static serve in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = process.env.FRIDAY_DIST_DIR
      ? path.resolve(process.env.FRIDAY_DIST_DIR)
      : path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`F.R.I.D.A.Y. Command Server active at http://localhost:${PORT}`);
  });
}

startServer();
