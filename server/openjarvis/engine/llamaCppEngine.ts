import type { InferenceEngine, GenerationOptions, GenerationResult } from './inferenceEngine.ts';

export class LlamaCppEngine implements InferenceEngine {
  readonly id = 'openjarvis-gguf';
  readonly name = 'OpenJarvis Local GGUF (llama.cpp)';
  private endpoint: string;

  constructor(endpoint = process.env.LLAMA_CPP_ENDPOINT || 'http://127.0.0.1:8080') {
    this.endpoint = endpoint.replace(/\/+$/, '');
  }

  async isAvailable(): Promise<boolean> {
    // If not explicitly configured or set to default without a real llama-server, verify JSON health response
    try {
      const res = await fetch(`${this.endpoint}/health`, { signal: AbortSignal.timeout(600) });
      if (!res.ok) return false;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return false;
      const data = await res.json() as { status?: string };
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  async generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.endpoint}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt,
          temperature: options?.temperature ?? 0.3,
          n_predict: options?.maxTokens ?? 512,
          stop: options?.stopSequences ?? ['</s>', '<|im_end|>'],
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        throw new Error(`llama.cpp returned HTTP ${res.status}`);
      }

      const data = await res.json() as { content?: string; tokens_predicted?: number };
      const text = data.content || '';
      const latencyMs = Math.max(1, Date.now() - start);

      return {
        text,
        tokensUsed: data.tokens_predicted || Math.round(text.length / 4),
        latencyMs,
        modelUsed: this.id,
        finishReason: 'stop',
      };
    } catch (err) {
      throw new Error(`LlamaCppEngine generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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
