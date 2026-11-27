import type { InferenceEngine, GenerationOptions, GenerationResult } from './inferenceEngine.ts';
import { runCognitiveTurn } from '../../cognitiveRuntime.ts';
import { normalizeUnicodeAndDevanagari } from '../../../src/core/cognitive/hinglishNlp.ts';

export class LocalCoreEngine implements InferenceEngine {
  readonly id = 'friday-local-core';
  readonly name = 'F.R.I.D.A.Y. Built-in Local Core';

  async isAvailable(): Promise<boolean> {
    return true; // Always available out of the box
  }

  async generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    const start = Date.now();
    const normalized = normalizeUnicodeAndDevanagari(prompt);
    
    // Execute through cognitive turn runtime
    const turn = await runCognitiveTurn({
      command: normalized,
      confirmedAction: true,
    });

    const latencyMs = Math.max(1, Date.now() - start);
    const estimatedTokens = Math.max(1, Math.round(turn.reply.length / 4));

    return {
      text: turn.reply,
      tokensUsed: estimatedTokens,
      latencyMs,
      modelUsed: this.id,
      finishReason: 'stop',
    };
  }

  async stream(
    prompt: string,
    onToken: (token: string) => void,
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    const res = await this.generate(prompt, options);
    const chunks = res.text.split(/(?<=\s)/);
    for (const chunk of chunks) {
      onToken(chunk);
    }
    return res;
  }
}
