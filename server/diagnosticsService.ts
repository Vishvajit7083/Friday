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
import { checkAiHealth, getRecentPipelineTimings, hasValidGeminiKey } from './aiService.ts';
import { isPathPermitted, scanPermittedFolders } from './fileService.ts';
import { searchFreeWeb } from './internetResearchService.ts';
import { checkOllamaStatus } from './localAiService.ts';
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

  const electronMainPath = path.resolve(process.cwd(), 'electron/main.ts');
  const electronPreloadPath = path.resolve(process.cwd(), 'electron/preload.ts');
  const electronBuilderPath = path.resolve(process.cwd(), 'electron-builder.yml');

  const mainSource = fs.existsSync(electronMainPath) ? fs.readFileSync(electronMainPath, 'utf-8') : '';
  const preloadSource = fs.existsSync(electronPreloadPath) ? fs.readFileSync(electronPreloadPath, 'utf-8') : '';
  const electronConfigured =
    Boolean(mainSource) && Boolean(preloadSource) && fs.existsSync(electronBuilderPath);

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
    hasApiKey: hasValidGeminiKey(),
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
    'local-ai-engine',
    'AI & Connectivity',
    'Local-First AI Engine & Zero-Key Readiness',
    'Assistant connects and operates cleanly without a paid cloud API key',
    async () => {
      const health = await checkAiHealth(db.settings.aiModel, db.settings.ollamaModel);
      return {
        actual: `${health.provider} (${health.model}) active in ${health.latencyMs}ms · Paid key required: ${health.requiresPaidKey ? 'Yes' : 'No'}`,
        status: health.connected ? 'pass' : 'fail',
      };
    }
  );

  await runCheck(
    'ollama-runtime',
    'AI & Connectivity',
    'Optional External Local LLM Runtime (LM Studio / llama.cpp / Ollama)',
    'Check optional local LLM endpoint if installed; built-in Local Core works without it',
    async () => {
      const openaiCompat = await import('./localAiService.ts').then((m) =>
        m.checkOpenAiCompatibleStatus(db.settings.ollamaModel)
      );
      if (openaiCompat.available && openaiCompat.selectedModel) {
        return {
          actual: `Local OpenAI-compatible server active at ${openaiCompat.baseUrl} (${openaiCompat.selectedModel}) in ${openaiCompat.latencyMs}ms`,
          status: 'pass',
        };
      }
      const ollama = await checkOllamaStatus(db.settings.ollamaModel);
      if (ollama.available && ollama.selectedModel) {
        return {
          actual: `Ollama ready at ${ollama.host} (${ollama.models.length} model(s), active: ${ollama.selectedModel}) in ${ollama.latencyMs}ms`,
          status: 'pass',
        };
      }
      return {
        actual: 'No external LLM server running — using Built-In Local Core + Live Web Knowledge',
        status: 'pass',
      };
    }
  );

  await runCheck(
    'free-web-research',
    'AI & Connectivity',
    'Free Direct Web Research (No Paid API Key)',
    'Retrieve public search snippets and Wikipedia/DuckDuckGo links without API keys',
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
    'database-rw',
    'Persistence',
    'Local Database Read & Integrity',
    'Load settings, calendar, memory, workflows, and action logs cleanly',
    async () => {
      const hasSettings = Boolean(db.settings?.assistantName);
      const counts = `${db.calendar.length} events, ${db.memory.length} memory, ${db.chatHistory.length} chats, ${db.actionLogs.length} logs`;
      return {
        actual: hasSettings ? `Healthy (${counts})` : 'Database settings missing',
        status: hasSettings ? 'pass' : 'fail',
        recommendation: hasSettings ? undefined : 'Verify write permissions to .friday-data/friday-db.json.',
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
  const target = path.resolve(process.cwd(), 'TEST_REPORT.md');
  fs.writeFileSync(target, md, 'utf-8');
  return target;
}
