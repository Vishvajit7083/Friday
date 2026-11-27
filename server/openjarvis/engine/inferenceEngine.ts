export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  systemPrompt?: string;
}

export interface GenerationResult {
  text: string;
  tokensUsed: number;
  latencyMs: number;
  modelUsed: string;
  finishReason: 'stop' | 'length' | 'tool_call';
}

export interface InferenceEngine {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult>;
  stream(prompt: string, onToken: (token: string) => void, options?: GenerationOptions): Promise<GenerationResult>;
}
