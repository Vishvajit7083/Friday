import fs from 'fs';
import path from 'path';
import type { ExecutionTrace, OpenJarvisAgentId, StepExecutionResult } from '../types.ts';
import { saveLearningCorrection } from '../../cognitiveDb.ts';

const TRACES_DIR = path.resolve(process.cwd(), '.friday-data', 'openjarvis-traces');
const recentTraces: ExecutionTrace[] = [];

export class OpenJarvisTraceRecorder {
  constructor() {
    try {
      if (!fs.existsSync(TRACES_DIR)) {
        fs.mkdirSync(TRACES_DIR, { recursive: true });
      }
    } catch {
      // Ignore directory creation error
    }
  }

  recordTrace(trace: Omit<ExecutionTrace, 'traceId' | 'timestamp' | 'estimatedGFlops' | 'estimatedEnergyMWh'>): ExecutionTrace {
    const traceId = `trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = new Date().toISOString();

    // Energy & compute estimation
    // Approx 2 FLOPs per parameter per token
    const estimatedGFlops = Number(((trace.tokensEstimated * 2 * 0.5) / 1000).toFixed(4));
    // Approx 0.0003 mWh per 100 tokens on typical CPU/GPU
    const estimatedEnergyMWh = Number(((trace.tokensEstimated * 0.0003)).toFixed(4));

    const fullTrace: ExecutionTrace = {
      ...trace,
      traceId,
      timestamp,
      estimatedGFlops,
      estimatedEnergyMWh,
    };

    recentTraces.unshift(fullTrace);
    if (recentTraces.length > 50) {
      recentTraces.length = 50;
    }

    // Persist to jsonl file
    try {
      const traceFile = path.join(TRACES_DIR, `traces_${new Date().toISOString().slice(0, 10)}.jsonl`);
      fs.appendFileSync(traceFile, JSON.stringify(fullTrace) + '\n', 'utf8');
    } catch {
      // Ignore file append error
    }

    return fullTrace;
  }

  getRecentTraces(limit = 20): ExecutionTrace[] {
    return recentTraces.slice(0, limit);
  }

  recordCorrection(traceId: string, originalCommand: string, correctedIntent: string, reason: string) {
    const trace = recentTraces.find((t) => t.traceId === traceId);
    if (trace) {
      trace.feedback = 'correction';
      trace.correctionDetail = `${correctedIntent}: ${reason}`;
    }

    // Save to cognitiveDb for Level 2 learning
    saveLearningCorrection({
      id: `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      wrongInput: originalCommand,
      correctedPhrase: reason,
      targetIntentId: correctedIntent,
      targetAction: 'openjarvis_correction',
      createdAt: new Date().toISOString(),
    });
  }

  exportTracesJsonl(): string {
    return recentTraces.map((t) => JSON.stringify(t)).join('\n');
  }
}

export const defaultTraceRecorder = new OpenJarvisTraceRecorder();
