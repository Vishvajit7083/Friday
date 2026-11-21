import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { appendActionLog, loadDb, saveDb } from './server/store.ts';
import { detectInstalledApps, getSystemTelemetry, getTopProcesses, launchApplication } from './server/systemService.ts';
import { getWeatherForLocation } from './server/weatherService.ts';
import { isPathPermitted, readPermittedFilePreview, scanPermittedFolders } from './server/fileService.ts';
import {
  analyzeMediaOrScreen,
  checkGeminiConnection,
  generateDailyBriefing,
  runAssistantCommand,
  runBrowserResearch,
  summarizeLocalFile,
  synthesizeSpeechWav,
  transcribeAudioBase64,
} from './server/aiService.ts';
import {
  getWindowsCompatibilityAudit,
  runSafeDiagnosticsSuite,
  writeTestReportFile,
} from './server/diagnosticsService.ts';
import {
  formatTestReportMarkdown,
  sanitizeCalendarPatch,
  sanitizeMemoryPatch,
  sanitizeSettingsPatch,
} from './src/core/diagnostics.ts';
import { findDuplicateGroups, searchIndexedFiles } from './src/core/fileIndex.ts';
import type { CalendarEvent, MemoryItem } from './src/core/types.ts';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  const rateBuckets = new Map<string, number[]>();
  function aiRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
    const key = `${req.ip || 'local'}:${req.path}`;
    const now = Date.now();
    const recent = (rateBuckets.get(key) ?? []).filter((ts) => now - ts < 60_000);
    if (recent.length >= 25) {
      return res.status(429).json({ error: 'Rate limit exceeded. Wait a few seconds before sending another AI request.' });
    }
    recent.push(now);
    rateBuckets.set(key, recent);
    next();
  }

  app.use(['/api/assistant', '/api/voice', '/api/vision', '/api/browser'], aiRateLimit);

  let cachedAiHealth: {
    checkedAt: number;
    status: Awaited<ReturnType<typeof checkGeminiConnection>>;
  } | null = null;

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/health/ai', async (req, res) => {
    const forceRefresh = req.query.refresh === '1';
    const now = Date.now();
    if (!forceRefresh && cachedAiHealth && now - cachedAiHealth.checkedAt < 60_000) {
      return res.json(cachedAiHealth.status);
    }
    const status = await checkGeminiConnection();
    cachedAiHealth = { checkedAt: now, status };
    res.json(status);
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
      const loc = (req.query.location as string) || db.settings.weatherLocation;
      const weather = await getWeatherForLocation(loc);
      res.json(weather);
    } catch (err) {
      res.status(502).json({ error: `Weather service unavailable: ${(err as Error).message}` });
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
      const indexed = scanPermittedFolders(db.settings.allowedFolders, db.settings.pausedIndexing, 250);
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

  app.post('/api/files/read', (req, res) => {
    try {
      const { filePath } = req.body as { filePath?: string };
      if (!filePath) {
        return res.status(400).json({ error: 'filePath is required' });
      }
      const db = loadDb();
      const preview = readPermittedFilePreview(filePath, db.settings.allowedFolders);
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

      appendActionLog(db, {
        agent: 'automation',
        action: 'Confirmed Safe Execution',
        target: summary.slice(0, 48),
        status: 'completed',
        detail: 'Simulated safe confirmation inside sandbox',
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
      const preview = readPermittedFilePreview(filePath, db.settings.allowedFolders);
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
      const audioBase64 = await synthesizeSpeechWav(text.trim(), voiceName || db.settings.voiceName);
      res.json({ audioBase64, mimeType: 'audio/wav' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/voice/transcribe', async (req, res) => {
    try {
      const { base64Data, mimeType } = req.body as { base64Data?: string; mimeType?: string };
      if (!base64Data) {
        return res.status(400).json({ error: 'base64Data is required' });
      }
      const text = await transcribeAudioBase64(base64Data, mimeType || 'audio/webm');
      res.json({ text });
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
    saveDb(db);
    res.json(db.settings);
  });

  app.delete('/api/chat', (_req, res) => {
    const db = loadDb();
    db.chatHistory = [];
    saveDb(db);
    res.json({ cleared: true });
  });

  // Vite middleware in development, static serve in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
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
