import fs from 'fs';
import path from 'path';
import type { ModelCatalogItem, HardwareProfile } from '../types.ts';

const OPENJARVIS_MODELS_DIR = path.resolve(process.cwd(), '.friday-data', 'openjarvis-models');

export const OPENJARVIS_MODEL_CATALOG: ModelCatalogItem[] = [
  {
    id: 'friday-local-core',
    name: 'F.R.I.D.A.Y. Built-in Local Core',
    provider: 'local_builtin',
    format: 'builtin',
    description: 'Deterministic 15-module cognitive engine. Zero latency, 0 MB download, runs 100% locally with zero setup.',
    parameterCount: 'Built-in Rules + Lexicon',
    quantization: 'N/A (Native TypeScript/C++)',
    memoryRequirementMb: 64,
    contextLength: 8192,
    downloaded: true,
    recommendedForHardware: true,
    status: 'ready',
    sizeBytes: 0,
  },
  {
    id: 'qwen2.5-0.5b-instruct',
    name: 'Qwen 2.5 0.5B Instruct (GGUF)',
    provider: 'gguf',
    format: 'gguf',
    description: 'Ultra-lightweight multilingual reasoning model. Excellent for low-spec laptops and quick offline NLP tasks.',
    parameterCount: '0.49B',
    quantization: 'Q4_K_M',
    memoryRequirementMb: 512,
    contextLength: 4096,
    downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    downloaded: false,
    recommendedForHardware: true,
    status: 'downloadable',
    sizeBytes: 397000000,
  },
  {
    id: 'qwen2.5-1.5b-instruct',
    name: 'Qwen 2.5 1.5B Instruct (GGUF)',
    provider: 'gguf',
    format: 'gguf',
    description: 'Fast, highly capable code generation and multi-step reasoning model.',
    parameterCount: '1.54B',
    quantization: 'Q4_K_M',
    memoryRequirementMb: 1200,
    contextLength: 8192,
    downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    downloaded: false,
    recommendedForHardware: false,
    status: 'downloadable',
    sizeBytes: 986000000,
  },
  {
    id: 'phi-3.5-mini-instruct',
    name: 'Phi-3.5 Mini 3.8B Instruct (GGUF)',
    provider: 'gguf',
    format: 'gguf',
    description: 'High-reasoning Microsoft model for complex coding and multi-agent synthesis.',
    parameterCount: '3.82B',
    quantization: 'Q4_K_M',
    memoryRequirementMb: 2600,
    contextLength: 8192,
    downloadUrl: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
    downloaded: false,
    recommendedForHardware: false,
    status: 'downloadable',
    sizeBytes: 2390000000,
  },
  {
    id: 'tinyllama-1.1b-chat',
    name: 'TinyLlama 1.1B Chat (GGUF)',
    provider: 'gguf',
    format: 'gguf',
    description: 'Proven compact conversational model optimized for resource-constrained environments.',
    parameterCount: '1.10B',
    quantization: 'Q4_K_M',
    memoryRequirementMb: 800,
    contextLength: 2048,
    downloadUrl: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    downloaded: false,
    recommendedForHardware: false,
    status: 'downloadable',
    sizeBytes: 669000000,
  },
];

export function getOpenJarvisModelCatalog(profile?: HardwareProfile): ModelCatalogItem[] {
  // Check on-disk model existence in OPENJARVIS_MODELS_DIR
  try {
    if (!fs.existsSync(OPENJARVIS_MODELS_DIR)) {
      fs.mkdirSync(OPENJARVIS_MODELS_DIR, { recursive: true });
    }
  } catch {
    // Ignore error
  }

  return OPENJARVIS_MODEL_CATALOG.map((model) => {
    if (model.id === 'friday-local-core') {
      return { ...model, downloaded: true, status: 'ready', recommendedForHardware: true };
    }

    const expectedFile = path.join(OPENJARVIS_MODELS_DIR, `${model.id}.gguf`);
    const isDownloaded = fs.existsSync(expectedFile);

    let isRecommended = false;
    if (profile) {
      if (profile.recommendedTier === 'ultra_light' && model.id === 'qwen2.5-0.5b-instruct') {
        isRecommended = true;
      } else if (profile.recommendedTier === 'light' && (model.id === 'qwen2.5-1.5b-instruct' || model.id === 'tinyllama-1.1b-chat')) {
        isRecommended = true;
      } else if (profile.recommendedTier === 'standard' && model.id === 'phi-3.5-mini-instruct') {
        isRecommended = true;
      }
    }

    return {
      ...model,
      downloaded: isDownloaded,
      localPath: isDownloaded ? expectedFile : undefined,
      status: isDownloaded ? 'ready' : 'downloadable',
      recommendedForHardware: isRecommended,
    };
  });
}
