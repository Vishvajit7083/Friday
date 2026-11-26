import fs from 'fs';
import os from 'os';
import path from 'path';
import type { GroundingSource } from '../src/core/types.ts';
import {
  CognitiveOrchestrator,
  type CognitiveKnowledgePort,
  type CognitiveLearningStorePort,
  type CognitiveMemoryStorePort,
  type CognitiveOrchestratorResult,
  type CognitiveToolAdapter,
  type DynamicIntentDefinition,
  type KnowledgeSearchResult,
  type LearningCorrectionRecord,
  type LexiconEntry,
  type TaskPatternSuggestion,
  type TrainingDatasetSample,
  type UserPreferenceProfile,
} from '../src/core/cognitive/index.ts';
import { FutureLanguageCoreProvider } from '../src/core/cognitive/learningPipeline.ts';
import { LocalCognitiveModelProvider } from '../src/core/cognitive/responseGenerator.ts';
import { buildWeatherChatSummary, parseWeatherQuery } from '../src/core/weatherUtils.ts';
import { formatBytes, searchIndexedFiles } from '../src/core/fileIndex.ts';
import { openWindowsFolder } from '../electron/windowsAutomation.ts';
import {
  appendTrainingDatasetSample,
  getPreferenceProfile,
  listCustomLexicon,
  listDynamicIntents,
  listLearningCorrections,
  listTaskPatternSuggestions,
  saveCognitiveMemory,
  saveDynamicIntent,
  saveLearningCorrection,
  savePreferenceProfile,
  saveTaskPatternSuggestion,
  saveTaskPlanRecord,
  searchCognitiveMemories,
} from './cognitiveDb.ts';
import { indexKnowledgeSources, searchKnowledgeBase } from './knowledgeEngine.ts';
import { getCachedFileIndex, isPathPermitted } from './fileService.ts';
import { getSystemTelemetry, handleAppOrWindowCommand } from './systemService.ts';
import { getWeatherForLocation } from './weatherService.ts';
import { handleMediaVoiceCommand } from './mediaService.ts';
import { searchFreeWeb } from './internetResearchService.ts';
import { appendActionLog, loadDb, saveDb } from './store.ts';

class SqliteMemoryStorePort implements CognitiveMemoryStorePort {
  search = searchCognitiveMemories;
  save = saveCognitiveMemory;
}

class SqliteKnowledgePort implements CognitiveKnowledgePort {
  search(query: string, limit = 5): KnowledgeSearchResult[] {
    return searchKnowledgeBase(query, limit);
  }
}

class SqliteLearningStorePort implements CognitiveLearningStorePort {
  getCustomLexicon(): LexiconEntry[] {
    return listCustomLexicon();
  }
  getCustomIntents(): DynamicIntentDefinition[] {
    return listDynamicIntents();
  }
  saveCustomIntent(intent: DynamicIntentDefinition): void {
    saveDynamicIntent(intent);
  }
  getCorrections(): LearningCorrectionRecord[] {
    return listLearningCorrections();
  }
  saveCorrection(correction: LearningCorrectionRecord): void {
    saveLearningCorrection(correction);
  }
  getPreferenceProfile(): UserPreferenceProfile {
    return getPreferenceProfile();
  }
  savePreferenceProfile(profile: UserPreferenceProfile): void {
    savePreferenceProfile(profile);
  }
  getPatternSuggestions(): TaskPatternSuggestion[] {
    return listTaskPatternSuggestions();
  }
  savePatternSuggestion(suggestion: TaskPatternSuggestion): void {
    saveTaskPatternSuggestion(suggestion);
  }
  appendTrainingSample(sample: TrainingDatasetSample): void {
    appendTrainingDatasetSample(sample);
  }
}

let cachedOnlineStatus: { checkedAt: number; online: boolean } | null = null;

export async function checkNetworkOnline(): Promise<boolean> {
  if (cachedOnlineStatus && Date.now() - cachedOnlineStatus.checkedAt < 15_000) {
    return cachedOnlineStatus.online;
  }
  const hasNonInternalIface = Object.values(os.networkInterfaces())
    .flat()
    .some((iface) => iface && !iface.internal);
  if (!hasNonInternalIface) {
    cachedOnlineStatus = { checkedAt: Date.now(), online: false };
    return false;
  }
  try {
    const res = await fetch('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json', {
      method: 'HEAD',
      signal: AbortSignal.timeout(2500),
    });
    const ok = res.ok;
    cachedOnlineStatus = { checkedAt: Date.now(), online: ok };
    return ok;
  } catch {
    cachedOnlineStatus = { checkedAt: Date.now(), online: false };
    return false;
  }
}

function resolvePermittedFolderTarget(folderHint: string, allowedFolders: string[]): string | null {
  const clean = folderHint.trim().toLowerCase();
  if (!clean || clean === 'workspace' || clean === 'project' || clean === 'current') {
    return allowedFolders[0] || process.cwd();
  }
  const direct = allowedFolders.find(
    (f) => path.basename(f).toLowerCase() === clean || f.toLowerCase().includes(clean)
  );
  if (direct && fs.existsSync(direct)) return direct;

  const homeSub = path.join(os.homedir(), folderHint);
  if (fs.existsSync(homeSub) && isPathPermitted(homeSub, allowedFolders)) {
    return homeSub;
  }
  const cwdSub = path.join(process.cwd(), folderHint);
  if (fs.existsSync(cwdSub) && isPathPermitted(cwdSub, allowedFolders)) {
    return cwdSub;
  }
  return allowedFolders[0] || null;
}

function createServerToolAdapter(onlineFlag: boolean): CognitiveToolAdapter {
  return {
    isOnline: () => onlineFlag,

    async getWeather(location?: string, dateHint?: string) {
      const db = loadDb();
      const target = location?.trim() || db.settings.weatherLocation || 'Kolhapur, MH';
      try {
        const w = await getWeatherForLocation(target);
        const parsed = parseWeatherQuery(dateHint === 'tomorrow' ? `weather tomorrow in ${target}` : `weather in ${target}`);
        const summary = buildWeatherChatSummary(w, parsed, db.settings.temperatureUnit || 'celsius');
        return { ok: true, summary };
      } catch (err) {
        return {
          ok: false,
          summary: `Weather lookup for "${target}" failed (${(err as Error).message}).`,
        };
      }
    },

    async getSystemTelemetry() {
      const t = await getSystemTelemetry();
      const batt = t.batteryPercent !== null ? `Battery ${t.batteryPercent}%${t.batteryCharging ? ' (charging)' : ''}` : 'Desktop AC power';
      return {
        ok: true,
        summary: `CPU ${t.cpuLoad}% (${t.cpuCores} cores, ${t.cpuModel}), RAM ${t.ramUsedGb}/${t.ramTotalGb} GB (${t.ramPercent}%), Storage ${t.storageUsedGb}/${t.storageTotalGb} GB (${t.storagePercent}%), ${batt}.`,
      };
    },

    async openApp(appTarget: string) {
      const db = loadDb();
      const res = await handleAppOrWindowCommand(`open ${appTarget}`, db.apps, db.settings.allowedFolders);
      appendActionLog(db, {
        agent: 'application',
        action: 'Cognitive App Launch',
        target: appTarget,
        status: 'completed',
        detail: res.message,
      });
      return { ok: true, summary: res.message, target: appTarget };
    },

    async openFolder(folderTarget: string) {
      const db = loadDb();
      const resolved = resolvePermittedFolderTarget(folderTarget, db.settings.allowedFolders);
      if (!resolved) {
        return { ok: false, summary: `Folder "${folderTarget}" is outside permitted directories or does not exist.` };
      }
      const winRes = await openWindowsFolder(resolved, db.settings.allowedFolders);
      return { ok: winRes.opened || fs.existsSync(resolved), summary: winRes.message, path: resolved };
    },

    async listFolderContents(folderTarget?: string) {
      const db = loadDb();
      const resolved = resolvePermittedFolderTarget(folderTarget || 'workspace', db.settings.allowedFolders);
      if (!resolved || !fs.existsSync(resolved)) {
        return {
          ok: false,
          summary: `Could not locate permitted folder "${folderTarget || 'workspace'}". Check allowed folders in Settings.`,
        };
      }
      const entries = fs.readdirSync(resolved, { withFileTypes: true }).slice(0, 16);
      const items = entries.map((e, idx) => ({
        id: `entry-${idx}`,
        label: `${e.name}${e.isDirectory() ? '/' : ''}`,
        kind: (e.isDirectory() ? 'folder' : 'file') as 'folder' | 'file',
        target: path.join(resolved, e.name),
        intentId: e.isDirectory() ? 'tool.open_folder' : 'tool.file_search',
      }));
      const preview = items.map((i) => i.label).join(', ');
      return {
        ok: true,
        summary: `Inside ${path.basename(resolved)} (${entries.length} item${entries.length === 1 ? '' : 's'} shown): ${preview || 'empty folder'}.`,
        items,
      };
    },

    async searchFiles(query: string) {
      const db = loadDb();
      const files = getCachedFileIndex(db.settings.allowedFolders, db.settings.pausedIndexing, 300);
      const matches = searchIndexedFiles(files, query, 'all').slice(0, 6);
      if (matches.length === 0) {
        return {
          ok: true,
          summary: `No matching files found inside your permitted folders for "${query}".`,
          items: [],
        };
      }
      const items = matches.map((f) => ({
        id: f.id,
        label: `${f.name} (${formatBytes(f.sizeBytes)})`,
        kind: 'file' as const,
        target: f.path,
        intentId: 'tool.file_search',
      }));
      return {
        ok: true,
        summary: `Found ${matches.length} file(s): ${matches.map((m) => `${m.name} (${m.relativePath})`).join('; ')}.`,
        items,
      };
    },

    async createReminderOrTodo(title: string, dateHint?: string, timeHint?: string) {
      const db = loadDb();
      const now = new Date();
      if (dateHint === 'tomorrow') {
        now.setDate(now.getDate() + 1);
      }
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = timeHint && /\d/.test(timeHint) ? timeHint : '09:00';
      const cleanTitle = title.trim() || 'Reminder';
      db.calendar.unshift({
        id: `evt-${Date.now()}`,
        title: cleanTitle,
        date: dateStr,
        time: timeStr.slice(0, 5).includes(':') ? timeStr.slice(0, 5) : '09:00',
        category: 'reminder',
        completed: false,
        notes: 'Created via F.R.I.D.A.Y. Cognitive Engine',
        createdAt: new Date().toISOString(),
      });
      saveDb(db);
      return {
        ok: true,
        summary: `Reminder saved for ${dateStr} (${timeStr}): "${cleanTitle}".`,
      };
    },

    async mediaControl(action: string) {
      const db = loadDb();
      const res = await handleMediaVoiceCommand(action, db.settings.allowedFolders, db.settings.pausedIndexing);
      return { ok: true, summary: res.message };
    },

    async webResearch(query: string) {
      if (!onlineFlag) {
        return {
          ok: false,
          summary: 'Internet is currently offline; cannot perform live public web research.',
          sources: [],
        };
      }
      const cleanQuery =
        query
          .replace(/^(?:hey\s+friday[,\s]+|friday[,\s]+)?(?:search(?:\s+google|\s+online|\s+the\s+web)?|research(?:\s+online)?|look\s+up|find)\s*(?:for|about|on)?\s+/i, '')
          .replace(/[?.!]+$/, '')
          .trim() || query;
      const searchRes = await searchFreeWeb(cleanQuery, 'web');
      if (!searchRes.online || searchRes.results.length === 0) {
        return {
          ok: false,
          summary: searchRes.error || `No live public results found for "${cleanQuery}".`,
          sources: [],
        };
      }
      const sources: GroundingSource[] = searchRes.results.map((r) => ({ title: r.title, uri: r.uri }));
      const summary = searchRes.results
        .slice(0, 3)
        .map((r, i) => `${i + 1}. ${r.title}: ${r.snippet || r.uri}`)
        .join(' ');
      return { ok: true, summary, sources };
    },

    async runActionByName(action: string, payload: Record<string, unknown>) {
      const target = String(payload.target || '');
      if (action === 'tool.open_app') {
        return this.openApp!(target);
      }
      if (action === 'tool.open_folder' || action === 'folder') {
        return this.openFolder!(target);
      }
      if (action === 'tool.folder_inspect') {
        return this.listFolderContents!(target);
      }
      if (action === 'tool.custom_clause') {
        if (/\b(?:open|launch|start|kholo)\b/i.test(target)) {
          if (/\b(?:folder|project)\b/i.test(target)) {
            return this.openFolder!(target);
          }
          const appName = target.replace(/^(?:open|launch|start|kholo)\s+/i, '').trim();
          return this.openApp!(appName);
        }
        return { ok: true, summary: `Executed step: ${target}` };
      }
      return { ok: true, summary: `Processed ${action}${target ? ` (${target})` : ''}.` };
    },
  };
}

let serverOrchestrator: CognitiveOrchestrator | null = null;
let knowledgeBootstrapped = false;

export function getServerCognitiveOrchestrator(): CognitiveOrchestrator {
  const db = loadDb();
  if (!knowledgeBootstrapped) {
    indexKnowledgeSources({
      allowedFolders: db.settings.allowedFolders,
      pausedIndexing: db.settings.pausedIndexing,
      notes: db.notes,
    });
    knowledgeBootstrapped = true;
  }

  if (!serverOrchestrator) {
    const modelProvider =
      db.settings.aiModel === 'friday-language-core'
        ? new FutureLanguageCoreProvider(process.env.FRIDAY_LANGUAGE_CORE_WEIGHTS)
        : new LocalCognitiveModelProvider();
    serverOrchestrator = new CognitiveOrchestrator({
      memoryStore: new SqliteMemoryStorePort(),
      knowledgeEngine: new SqliteKnowledgePort(),
      learningStore: new SqliteLearningStorePort(),
      toolAdapter: createServerToolAdapter(true),
      modelProvider,
      sessionId: 'desktop-server',
    });
  }
  return serverOrchestrator;
}

export async function runCognitiveTurn(params: {
  command: string;
  confirmedAction?: boolean;
  source?: 'text' | 'voice';
}): Promise<CognitiveOrchestratorResult> {
  const db = loadDb();
  const online = await checkNetworkOnline();
  const orchestrator = getServerCognitiveOrchestrator();

  // Refresh tool adapter with latest online state & selected model provider
  const activeModel =
    db.settings.aiModel === 'friday-language-core'
      ? new FutureLanguageCoreProvider(process.env.FRIDAY_LANGUAGE_CORE_WEIGHTS)
      : new LocalCognitiveModelProvider();
  orchestrator.setModelProvider(activeModel);

  // Recreate orchestrator cleanly only if online flag changed via fresh turnDeps? Keep context by updating toolAdapter on a lightweight wrapper.
  (orchestrator as unknown as { deps: { toolAdapter: CognitiveToolAdapter } }).deps.toolAdapter =
    createServerToolAdapter(online);

  const result = await orchestrator.processTurn({
    rawText: params.command,
    userName: db.settings.userName,
    assistantName: db.settings.assistantName,
    defaultLocation: db.settings.weatherLocation,
    online,
    confirmedAction: params.confirmedAction,
    source: params.source,
  });

  if (result.taskPlan) {
    saveTaskPlanRecord(result.taskPlan);
  }

  return result;
}
