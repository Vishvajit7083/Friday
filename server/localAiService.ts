import type { SystemTelemetry } from '../src/core/types.ts';
import { formatBytes } from '../src/core/fileIndex.ts';
import { lookupBuiltinKnowledge } from '../src/core/cognitive/builtinKnowledge.ts';
import { tryEvaluateSafeMath } from '../src/core/intentEngine.ts';
import { tryConvertUnits } from '../src/core/unitConverter.ts';
import { tryTranslateCommand } from '../src/core/translator.ts';
import { buildExtractiveSummary } from './internetResearchService.ts';

export function buildLocalDeterministicReply(params: {
  command: string;
  userName: string;
  telemetry?: SystemTelemetry | null;
  matchedFiles?: Array<{ name: string; relativePath: string; sizeBytes: number }>;
  weatherSummary?: string;
  calendarSummary?: string;
  memorySummary?: string;
  webSnippets?: Array<{ title: string; uri: string; snippet: string }>;
  webPageExtract?: { title: string; uri: string; excerpt: string } | null;
}): string {
  const { command, userName } = params;
  const lower = command.trim().toLowerCase();

  if (/^(h+i+|h+e+l+o+|h+e+y+|hlo+|good\s+(?:morning|afternoon|evening)|namaste|namaskar)\b/i.test(lower)) {
    return `Hi ${userName}, I'm ready. Ask me to open an app, search the web, check system performance, or explain any topic.`;
  }
  if (/\b(who are you|what can you do|help)\b/i.test(lower)) {
    return `I am F.R.I.D.A.Y., running my self-owned 15-module Cognitive Engine offline-first. I understand English, Hindi, and Hinglish, remember context across turns, manage 6-layer SQLite memory, teach custom commands, launch apps, search permitted folders, compute math/units, and run optional online web search when connected.`;
  }
  if (/\b(what time|current time|what date|today'?s date|day is it)\b/i.test(lower)) {
    const now = new Date();
    return `It is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`;
  }

  const mathResult = tryEvaluateSafeMath(command);
  if (mathResult !== null) {
    return `The result is ${mathResult}.`;
  }

  const unitResult = tryConvertUnits(command);
  if (unitResult) {
    return `${unitResult.formattedOutput} (${unitResult.explanation})`;
  }

  const transResult = tryTranslateCommand(command);
  if (transResult) {
    return `${transResult.translatedText}${transResult.romanized ? ` (${transResult.romanized})` : ''}`;
  }

  if (params.weatherSummary) {
    return params.weatherSummary;
  }

  if (params.telemetry) {
    const t = params.telemetry;
    const batteryLine =
      t.batteryPercent !== null
        ? `Battery is at ${t.batteryPercent}%${t.batteryCharging ? ' (charging)' : ''}.`
        : 'Desktop AC power active (no battery reported).';
    return `${t.hostname} (${t.platform}): CPU load ${t.cpuLoad}% across ${t.cpuCores} cores (${t.cpuModel}), RAM ${t.ramUsedGb}/${t.ramTotalGb} GB (${t.ramPercent}%), Disk ${t.storageUsedGb}/${t.storageTotalGb} GB (${t.storagePercent}%). ${batteryLine}`;
  }

  if (params.matchedFiles) {
    if (params.matchedFiles.length === 0) {
      return `I scanned your permitted workspace folders and found no files matching "${command}". Add or authorize additional folders in Settings if needed.`;
    }
    const list = params.matchedFiles
      .slice(0, 5)
      .map((f) => `${f.name} (${formatBytes(f.sizeBytes)}, ${f.relativePath})`)
      .join('; ');
    return `Found ${params.matchedFiles.length} matching file${params.matchedFiles.length === 1 ? '' : 's'}: ${list}.`;
  }

  if (params.calendarSummary) return params.calendarSummary;
  if (params.memorySummary) return params.memorySummary;

  if (params.webPageExtract) {
    const summary = buildExtractiveSummary(params.webPageExtract.excerpt, command, 6);
    return `${params.webPageExtract.title} (${params.webPageExtract.uri}):\n\n${summary}`;
  }

  if (params.webSnippets && params.webSnippets.length > 0) {
    const bullets = params.webSnippets
      .slice(0, 4)
      .map((s, i) => `${i + 1}. ${s.title}: ${s.snippet || s.uri}`)
      .join('\n\n');
    return `Live public web findings for "${command}":\n\n${bullets}`;
  }

  const kbHit = lookupBuiltinKnowledge(command);
  if (kbHit) {
    return kbHit.summary;
  }

  return `I didn't match a specific action for "${command}". Ask me to open an app, search the web, check laptop performance, manage folders, or explain a topic.`;
}
