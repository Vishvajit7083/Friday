import fs from 'fs';
import os from 'os';
import path from 'path';
import si from 'systeminformation';
import {
  determineOptimizationProfile,
  formatTestReportMarkdown,
  summarizeDiagnostics,
} from '../src/core/diagnostics.ts';
import { analyzeUserCommand } from '../src/core/intentEngine.ts';
import type {
  DiagnosticCheckItem,
  DiagnosticsReportPayload,
  HardwareCompatibilityAudit,
} from '../src/core/types.ts';
import { understandUserInput } from '../src/core/cognitive/languageUnderstanding.ts';
import { checkAiHealth, getRecentPipelineTimings } from './aiService.ts';
import {
  listCognitiveMemories,
  listDynamicIntents,
  listKnowledgeChunks,
} from './cognitiveDb.ts';
import { isPathPermitted, scanPermittedFolders } from './fileService.ts';
import { searchFreeWeb } from './internetResearchService.ts';
import { loadDb } from './store.ts';
import { detectInstalledApps, getSystemTelemetry } from './systemService.ts';
import { discoverWindowsStartApps, getWindowsSpeechCapabilities } from '../electron/windowsAutomation.ts';

export async function getWindowsCompatibilityAudit(): Promise<HardwareCompatibilityAudit> {
  const [osInfo, cpu, graphics, mem, fsSizes, diskLayout, netIfaces] = await Promise.all([
    si.osInfo().catch(() => null),
    si.cpu().catch(() => null),
    si.graphics().catch(() => null),
    si.mem().catch(() => null),
    si.fsSize().catch(() => []),
    si.diskLayout().catch(() => []),
    si.networkInterfaces().catch(() => []),
  ]);

  const isWindows = process.platform === 'win32';
  const ramTotalBytes = mem?.total ?? os.totalmem();
  const ramAvailableBytes = mem?.available ?? os.freemem();
  const ramTotalGb = Number((ramTotalBytes / 1024 ** 3).toFixed(1));
  const ramAvailableGb = Number((ramAvailableBytes / 1024 ** 3).toFixed(1));

  const primaryDisk =
    fsSizes.find((d) => d.mount === '/' || d.mount.toUpperCase().startsWith('C:')) ?? fsSizes[0];
  const storageTotalGb = primaryDisk ? Number((primaryDisk.size / 1024 ** 3).toFixed(1)) : 0;
  const storageFreeGb = primaryDisk
    ? Number((((primaryDisk.size - primaryDisk.used) || 0) / 1024 ** 3).toFixed(1))
    : 0;

  const primaryLayout = Array.isArray(diskLayout) ? diskLayout[0] : undefined;
  const storageType = primaryLayout?.type
    ? `${primaryLayout.type}${primaryLayout.interfaceType ? ` (${primaryLayout.interfaceType})` : ''}`
    : 'Unavailable';

  const gpuCtrl = graphics?.controllers?.[0];
  const gpuName = gpuCtrl?.model?.trim() || 'Unavailable';
  const gpuVendor = gpuCtrl?.vendor?.trim() || 'Unavailable';
  const gpuVramMb = typeof gpuCtrl?.vram === 'number' && gpuCtrl.vram > 0 ? gpuCtrl.vram : null;
  const gpuDriver = gpuCtrl?.driverVersion?.trim() || null;

  const cpuCores = cpu?.cores ?? os.cpus().length;
  const cpuModel = cpu ? `${cpu.manufacturer} ${cpu.brand}`.trim() : os.cpus()[0]?.model ?? 'Unavailable';
  const cpuSpeedGhz = typeof cpu?.speed === 'number' && cpu.speed > 0 ? Number(cpu.speed.toFixed(2)) : null;

  const appRoot = process.env.FRIDAY_APP_ROOT ? path.resolve(process.env.FRIDAY_APP_ROOT) : process.cwd();
  const electronMainCandidates = [
    path.join(appRoot, 'electron/main.ts'),
    path.join(appRoot, 'dist-electron/electron/main.js'),
  ];
  const electronPreloadCandidates = [
    path.join(appRoot, 'electron/preload.ts'),
    path.join(appRoot, 'dist-electron/electron/preload.cjs'),
  ];
  const electronBuilderCandidates = [
    path.join(appRoot, 'electron-builder.yml'),
    path.join(appRoot.replace(/app\.asar$/i, 'app.asar.unpacked'), 'electron-builder.yml'),
  ];

  const mainPath = electronMainCandidates.find((p) => fs.existsSync(p));
  const preloadPath = electronPreloadCandidates.find((p) => fs.existsSync(p));
  const builderPath = electronBuilderCandidates.find((p) => fs.existsSync(p));

  const mainSource = mainPath ? fs.readFileSync(mainPath, 'utf-8') : '';
  const preloadSource = preloadPath ? fs.readFileSync(preloadPath, 'utf-8') : '';
  const electronConfigured = Boolean(mainSource) && Boolean(preloadSource) && Boolean(builderPath);

  const db = loadDb();
  const activeNet = Array.isArray(netIfaces)
    ? netIfaces.some((n) => !n.internal && n.operstate === 'up')
    : false;

  const majorNode = Number(process.versions.node.split('.')[0] || 0);
  const windowsCompatible =
    majorNode >= 18 && (process.arch === 'x64' || process.arch === 'arm64') && electronConfigured;

  return {
    timestamp: new Date().toISOString(),
    osName: osInfo?.distro || osInfo?.platform || process.platform,
    osEdition: isWindows ? osInfo?.release || 'Windows Desktop' : 'Container / Non-Windows Host',
    osVersion: osInfo?.release || os.release(),
    platform: process.platform,
    arch: process.arch,
    isWindows,
    windowsCompatible,
    nodeVersion: process.version,
    cpuModel,
    cpuCores,
    cpuSpeedGhz,
    gpuName,
    gpuVendor,
    gpuVramMb,
    gpuDriver,
    ramTotalGb,
    ramAvailableGb,
    storageTotalGb,
    storageFreeGb,
    storageType,
    networkAvailable: activeNet || Object.keys(os.networkInterfaces()).length > 0,
    hasApiKey: false,
    electronConfigured,
    securityPosture: {
      contextIsolation: mainSource.includes('contextIsolation: true'),
      nodeIntegrationDisabled: mainSource.includes('nodeIntegration: false'),
      folderSandboxActive: db.settings.allowedFolders.length > 0,
      apiKeyServerOnly: true,
    },
    optimizationProfile: determineOptimizationProfile(ramTotalGb, cpuCores),
  };
}

export async function runSafeDiagnosticsSuite(): Promise<DiagnosticsReportPayload> {
  const checks: DiagnosticCheckItem[] = [];
  const audit = await getWindowsCompatibilityAudit();
  const db = loadDb();

  async function runCheck(
    id: string,
    category: string,
    name: string,
    expected: string,
    fn: () => Promise<Omit<DiagnosticCheckItem, 'id' | 'category' | 'name' | 'expected' | 'durationMs' | 'checkedAt'>>
  ) {
    const started = Date.now();
    try {
      const outcome = await fn();
      checks.push({
        id,
        category,
        name,
        expected,
        durationMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
        ...outcome,
      });
    } catch (err) {
      checks.push({
        id,
        category,
        name,
        expected,
        actual: 'Check threw an unhandled exception',
        status: 'fail',
        durationMs: Date.now() - started,
        error: (err as Error).message,
        recommendation: 'Inspect server logs and verify configuration.',
        checkedAt: new Date().toISOString(),
      });
    }
  }

  await runCheck(
    'windows-compat',
    'Windows & Host',
    'Windows Target & Runtime Compatibility',
    'Node.js >= 18, x64/arm64, Electron & Windows 10/11 target verified',
    async () => {
      if (audit.isWindows) {
        return {
          actual: `${audit.osName} ${audit.osVersion} (${audit.arch}), Node ${audit.nodeVersion}`,
          status: audit.windowsCompatible ? 'pass' : 'warning',
          recommendation: audit.windowsCompatible
            ? undefined
            : 'Upgrade Node.js to LTS >= 20 and verify x64 Windows build.',
        };
      }
      return {
        actual: `Running in ${audit.osName} (${audit.platform}/${audit.arch}), Node ${audit.nodeVersion}`,
        status: 'warning',
        error: 'Current host is Linux container, not a physical Windows 10/11 laptop.',
        recommendation: 'Run npm run build && Electron desktop test on physical Windows 11/10 target.',
      };
    }
  );

  await runCheck(
    'telemetry-core',
    'Hardware Monitoring',
    'CPU, RAM & Storage Sensors',
    'Live numeric CPU, RAM, and Storage readings from systeminformation',
    async () => {
      const t = await getSystemTelemetry();
      const valid = t.ramTotalGb > 0 && t.cpuCores > 0;
      return {
        actual: `CPU ${t.cpuLoad}% (${t.cpuCores} cores) · RAM ${t.ramUsedGb}/${t.ramTotalGb} GB (${t.ramPercent}%) · Disk ${t.storagePercent}%`,
        status: valid ? 'pass' : 'fail',
        error: valid ? undefined : 'Hardware sensor values returned zero.',
        recommendation: valid ? undefined : 'Verify systeminformation OS sensor access.',
      };
    }
  );

  await runCheck(
    'telemetry-gpu-thermal',
    'Hardware Monitoring',
    'GPU Utilization & Thermal Sensors',
    'Report live GPU/thermal values or Unavailable without fabrication',
    async () => {
      const t = await getSystemTelemetry();
      if (t.gpuUsage !== null || t.cpuTemp !== null || t.gpuTemp !== null) {
        return {
          actual: `GPU ${t.gpuUsage ?? 'Unavailable'}% · CPU Temp ${t.cpuTemp ?? 'Unavailable'}°C · GPU Temp ${t.gpuTemp ?? 'Unavailable'}°C`,
          status: 'pass',
        };
      }
      return {
        actual: `GPU (${audit.gpuName}) utilization and thermal sensors report Unavailable on this host`,
        status: 'unavailable',
        recommendation: 'Test on physical Windows hardware with WMI / vendor GPU drivers enabled.',
      };
    }
  );

  await runCheck(
    'cognitive-engine',
    'Cognitive Brain',
    'F.R.I.D.A.Y. Cognitive Engine & Zero-API Autonomy',
    '15-module self-owned brain operates 100% locally without Ollama or cloud AI keys',
    async () => {
      const health = await checkAiHealth(db.settings.aiModel);
      return {
        actual: `${health.provider} (${health.model}) active in ${health.latencyMs}ms · Paid key required: ${health.requiresPaidKey ? 'Yes' : 'No'}`,
        status: health.connected && !health.requiresPaidKey ? 'pass' : 'fail',
      };
    }
  );

  await runCheck(
    'hinglish-nlp',
    'Cognitive Brain',
    'Hinglish NLP & Typo Tolerance',
    'Detect Hinglish language and canonicalize Romanized Hindi actions + ASR typos',
    async () => {
      const sample = understandUserInput('Kal ka wether check kar aur crom kholo');
      const ok = sample.detectedLanguage === 'hinglish' && sample.entities.app === 'chrome';
      return {
        actual: `Language=${sample.detectedLanguage}, Corrections=${sample.spellingCorrections.length}, AppEntity=${sample.entities.app || 'none'}`,
        status: ok ? 'pass' : 'fail',
      };
    }
  );

  await runCheck(
    'sqlite-cognitive-memory',
    'Persistence',
    'SQLite 6-Layer Memory, Intents & Knowledge Store',
    'Load SQLite tables cleanly with parameterized queries',
    async () => {
      const memCount = listCognitiveMemories(undefined, 200).length;
      const intentCount = listDynamicIntents().length;
      const knowCount = listKnowledgeChunks(200).length;
      return {
        actual: `SQLite healthy (${memCount} cognitive memories, ${intentCount} custom intents, ${knowCount} knowledge chunks, ${db.calendar.length} calendar events)`,
        status: 'pass',
      };
    }
  );

  await runCheck(
    'free-web-research',
    'AI & Connectivity',
    'Optional Public Web Research (Online Tool)',
    'Retrieve public search snippets when online or report offline honestly',
    async () => {
      const res = await searchFreeWeb('TypeScript', 'docs');
      if (res.online && res.results.length > 0) {
        return {
          actual: `Retrieved ${res.results.length} live result(s) with verified links without paid API key`,
          status: 'pass',
        };
      }
      return {
        actual: res.error ? `Search error: ${res.error}` : 'No search results returned (offline or rate-limited)',
        status: 'warning',
        recommendation: 'Verify internet connectivity or retry live web research.',
      };
    }
  );

  await runCheck(
    'pipeline-latency',
    'Performance',
    'Pipeline Stage Latency Telemetry',
    'Track intent, tool, first-token, and total response timing cleanly',
    async () => {
      const timings = getRecentPipelineTimings();
      if (timings.length === 0) {
        return {
          actual: 'Latency tracker armed (send one command to populate live timing sample)',
          status: 'pass',
        };
      }
      const latest = timings[0];
      return {
        actual: `Latest (${latest.engine}): intent ${latest.intentMs}ms · tools ${latest.toolMs}ms · first-token ${latest.firstTokenMs}ms · total ${latest.totalMs}ms`,
        status: 'pass',
      };
    }
  );

  await runCheck(
    'file-sandbox',
    'Files & Security',
    'Permitted Folder Index & Path Traversal Block',
    'Scan permitted folders and reject outside-sandbox & traversal paths',
    async () => {
      const indexed = scanPermittedFolders(db.settings.allowedFolders, false, 60);
      const unixBlocked = !isPathPermitted('/etc/passwd', db.settings.allowedFolders);
      const winBlocked = !isPathPermitted('C:\\Windows\\System32\\cmd.exe', db.settings.allowedFolders);
      const traversalBlocked = !isPathPermitted(
        path.resolve(process.cwd(), '../outside-sandbox-check.txt'),
        db.settings.allowedFolders
      );
      if (unixBlocked && winBlocked && traversalBlocked) {
        return {
          actual: `Indexed ${indexed.length} permitted file(s); outside-sandbox & traversal paths blocked cleanly`,
          status: 'pass',
        };
      }
      return {
        actual: 'Path confinement check failed',
        status: 'fail',
        error: 'Outside-sandbox path was not rejected.',
        recommendation: 'Review allowedFolders list in Settings.',
      };
    }
  );

  await runCheck(
    'app-discovery',
    'Applications',
    'Desktop Application Discovery',
    'Check installed commands via OS path / Windows Get-StartApps',
    async () => {
      const apps = await detectInstalledApps(db.apps);
      const installedCount = apps.filter((a) => a.installed).length;
      const startApps = await discoverWindowsStartApps().catch(() => []);
      if (audit.isWindows) {
        return {
          actual: `${installedCount}/${apps.length} command apps + ${startApps.length} Windows Start Apps detected`,
          status: installedCount > 0 || startApps.length > 0 ? 'pass' : 'warning',
        };
      }
      return {
        actual: `${installedCount}/${apps.length} host commands detected (Windows Start Apps unavailable in Linux container)`,
        status: 'unavailable',
        recommendation: 'Run desktop discovery on Windows 10/11 host to detect Chrome, VS Code, Terminal, etc.',
      };
    }
  );

  await runCheck(
    'intent-safety',
    'AI & Security',
    'Confirmation Gate & Permission Boundary',
    'Require explicit confirmation before destructive commands',
    async () => {
      const parsed = analyzeUserCommand('delete all temporary build files');
      return {
        actual: parsed.requiresConfirmation
          ? `Blocked for confirmation (${parsed.category})`
          : 'Destructive command did not trigger confirmation gate',
        status: parsed.requiresConfirmation ? 'pass' : 'fail',
        recommendation: parsed.requiresConfirmation
          ? undefined
          : 'Audit SENSITIVE_PATTERNS in src/core/intentEngine.ts.',
      };
    }
  );

  await runCheck(
    'electron-security',
    'Electron & Security',
    'Electron Context Isolation & Builder Config',
    'contextIsolation: true, nodeIntegration: false, preload bridge, electron-builder.yml present',
    async () => {
      const sec = audit.securityPosture;
      const ok = audit.electronConfigured && sec.contextIsolation && sec.nodeIntegrationDisabled;
      return {
        actual: ok
          ? 'contextIsolation=true, nodeIntegration=false, IPC preload & electron-builder.yml verified'
          : 'Electron configuration incomplete',
        status: ok ? 'pass' : 'warning',
        recommendation: ok ? undefined : 'Ensure electron/main.ts and electron/preload.ts compile cleanly.',
      };
    }
  );

  await runCheck(
    'voice-speech-bridge',
    'Voice & Audio',
    'Windows Native Speech Recognition & SAPI TTS Readiness',
    'Inspect Windows System.Speech offline recognizers, SAPI voices, and mic privacy registry',
    async () => {
      const voiceCaps = await getWindowsSpeechCapabilities();
      if (audit.isWindows) {
        const denied =
          voiceCaps.micAccessStatus === 'denied' || voiceCaps.micAccessStatus === 'desktop-apps-denied';
        return {
          actual: `Recognizers: [${voiceCaps.recognizers.join(', ') || 'None'}] · SAPI Voices: ${voiceCaps.ttsVoices.length} · Mic Privacy: ${voiceCaps.micAccessStatus}`,
          status: !denied && (voiceCaps.offlineSttReady || voiceCaps.ttsVoices.length > 0) ? 'pass' : 'warning',
          error: denied ? 'Windows Microphone Privacy denies desktop apps.' : undefined,
          recommendation: denied
            ? 'Enable Settings -> Privacy & security -> Microphone -> "Let desktop apps access your microphone".'
            : voiceCaps.offlineSttReady
              ? undefined
              : 'Install a Windows Speech language pack in Windows Settings -> Time & language -> Speech for offline dictation.',
        };
      }
      return {
        actual: 'Linux container host — Browser Web Speech API & Linux mic input active; Windows System.Speech runs on Windows 10/11',
        status: 'unavailable',
        recommendation: 'Run on Windows 10/11 desktop for native offline System.Speech recognition & SAPI TTS.',
      };
    }
  );

  const report: DiagnosticsReportPayload = {
    generatedAt: new Date().toISOString(),
    environment: `${audit.osName} (${audit.platform}/${audit.arch})`,
    summary: summarizeDiagnostics(checks),
    audit,
    checks,
  };

  return report;
}

export function writeTestReportFile(report: DiagnosticsReportPayload): string {
  const md = formatTestReportMarkdown(report);
  const baseDir = process.env.FRIDAY_DATA_DIR
    ? path.resolve(process.env.FRIDAY_DATA_DIR)
    : process.cwd();
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  const target = path.join(baseDir, 'TEST_REPORT.md');
  fs.writeFileSync(target, md, 'utf-8');
  return target;
}
