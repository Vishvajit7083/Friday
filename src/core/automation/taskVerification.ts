import type { RecoveryStrategy, VerificationExpectation } from './types';

export interface VerificationCheckInput {
  expectation: VerificationExpectation;
  fileExists?: boolean;
  fileSizeBytes?: number;
  ooxmlValid?: boolean;
  ooxmlEntries?: string[];
  httpStatus?: number;
  httpBody?: string;
  syntaxValid?: boolean;
  syntaxErrors?: string[];
  processStarted?: boolean;
  windowOrUrlOpened?: boolean;
  resultText?: string;
}

export interface VerificationResult {
  verified: boolean;
  reason: string;
}

export class TaskVerificationEngine {
  static evaluate(input: VerificationCheckInput): VerificationResult {
    const { expectation } = input;
    switch (expectation.type) {
      case 'file_exists': {
        if (!input.fileExists) {
          return { verified: false, reason: `Expected file or folder "${expectation.target || 'target'}" does not exist.` };
        }
        if (input.fileSizeBytes !== undefined && input.fileSizeBytes <= 0) {
          return { verified: false, reason: `Created file "${expectation.target || 'target'}" is 0 bytes.` };
        }
        return {
          verified: true,
          reason: `Verified path exists${input.fileSizeBytes !== undefined ? ` (${input.fileSizeBytes} bytes)` : ''}.`,
        };
      }
      case 'ooxml_valid': {
        if (!input.fileExists || !input.ooxmlValid) {
          return {
            verified: false,
            reason: `Office OpenXML document "${expectation.target || 'document'}" failed structural archive verification.`,
          };
        }
        return {
          verified: true,
          reason: `Verified valid Office OpenXML package (${input.ooxmlEntries?.length ?? 0} archive entries).`,
        };
      }
      case 'http_ok': {
        const ok = typeof input.httpStatus === 'number' && input.httpStatus >= 200 && input.httpStatus < 400;
        if (!ok || !input.httpBody?.trim()) {
          return {
            verified: false,
            reason: `Local preview HTTP verification failed (status ${input.httpStatus ?? 'none'}).`,
          };
        }
        return {
          verified: true,
          reason: `Verified HTTP ${input.httpStatus} live preview (${input.httpBody.length} chars rendered).`,
        };
      }
      case 'syntax_valid': {
        if (!input.syntaxValid) {
          return {
            verified: false,
            reason: `Syntax validation failed: ${(input.syntaxErrors || []).join('; ') || 'unknown error'}`,
          };
        }
        return { verified: true, reason: 'Static syntax and structural check passed with 0 errors.' };
      }
      case 'process_started': {
        if (!input.processStarted) {
          return {
            verified: false,
            reason: input.resultText || 'Process or command did not complete cleanly.',
          };
        }
        return { verified: true, reason: input.resultText || 'Process execution verified.' };
      }
      case 'window_or_url': {
        if (!input.windowOrUrlOpened && !input.resultText) {
          return { verified: false, reason: 'Window or URL launch could not be verified.' };
        }
        return {
          verified: true,
          reason: input.resultText || 'Target action verified.',
        };
      }
      case 'result_non_empty': {
        if (!input.resultText || !input.resultText.trim()) {
          return { verified: false, reason: 'Step produced an empty result.' };
        }
        return { verified: true, reason: 'Non-empty result verified.' };
      }
      default:
        return { verified: false, reason: 'Unknown verification rule.' };
    }
  }
}

export class ErrorRecoveryEngine {
  static async runWithRecovery<T extends { ok: boolean; error?: string }>(params: {
    strategy: RecoveryStrategy;
    attemptFn: (attempt: number) => Promise<T>;
    fallbackFn?: () => Promise<T>;
    onRetry?: (attempt: number, reason: string) => void;
  }): Promise<{ result: T; attempts: number; usedFallback: boolean }> {
    const maxRetries = Math.min(3, Math.max(0, params.strategy.maxRetries));
    let attempts = 0;
    let lastResult: T = { ok: false, error: 'Not executed' } as T;

    for (let i = 0; i <= maxRetries; i += 1) {
      attempts += 1;
      lastResult = await params.attemptFn(attempts);
      if (lastResult.ok) {
        return { result: lastResult, attempts, usedFallback: false };
      }
      if (i < maxRetries) {
        params.onRetry?.(attempts, lastResult.error || 'Step failed');
      }
    }

    if (params.fallbackFn) {
      attempts += 1;
      const fbResult = await params.fallbackFn();
      if (fbResult.ok) {
        return { result: fbResult, attempts, usedFallback: true };
      }
      lastResult = fbResult;
    }

    return { result: lastResult, attempts, usedFallback: false };
  }
}
