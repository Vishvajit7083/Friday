import fs from 'fs';
import path from 'path';
import os from 'os';
import { OPENJARVIS_MODEL_CATALOG } from '../intelligence/modelCatalog.ts';

export interface DownloadProgress {
  modelId: string;
  status: 'idle' | 'downloading' | 'completed' | 'cancelled' | 'error';
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBytesSec: number;
  error?: string;
}

const activeDownloads = new Map<string, { controller: AbortController; progress: DownloadProgress }>();

export function getDownloadStatus(modelId: string): DownloadProgress {
  const active = activeDownloads.get(modelId);
  if (active) return active.progress;

  const model = OPENJARVIS_MODEL_CATALOG.find((m) => m.id === modelId);
  const modelsDir = path.resolve(process.cwd(), '.friday-data', 'openjarvis-models');
  const targetFile = path.join(modelsDir, `${modelId}.gguf`);

  if (fs.existsSync(targetFile)) {
    const stats = fs.statSync(targetFile);
    return {
      modelId,
      status: 'completed',
      percent: 100,
      downloadedBytes: stats.size,
      totalBytes: stats.size,
      speedBytesSec: 0,
    };
  }

  return {
    modelId,
    status: 'idle',
    percent: 0,
    downloadedBytes: 0,
    totalBytes: model?.sizeBytes || 0,
    speedBytesSec: 0,
  };
}

export async function cancelModelDownload(modelId: string): Promise<boolean> {
  const active = activeDownloads.get(modelId);
  if (active) {
    active.controller.abort();
    activeDownloads.delete(modelId);
    return true;
  }
  return false;
}

export async function startSafeModelDownload(
  modelId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadProgress> {
  const model = OPENJARVIS_MODEL_CATALOG.find((m) => m.id === modelId);
  if (!model || !model.downloadUrl) {
    throw new Error(`Model ${modelId} not found or has no download URL.`);
  }

  const modelsDir = path.resolve(process.cwd(), '.friday-data', 'openjarvis-models');
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const targetFile = path.join(modelsDir, `${modelId}.gguf`);
  const partFile = `${targetFile}.part`;

  // Free disk space check
  const freeRamMb = Math.round(os.freemem() / (1024 * 1024));
  if (model.memoryRequirementMb > freeRamMb * 1.5) {
    throw new Error(
      `Insufficient RAM: Model requires ~${model.memoryRequirementMb} MB, but available system free memory is ${freeRamMb} MB.`
    );
  }

  if (activeDownloads.has(modelId)) {
    return activeDownloads.get(modelId)!.progress;
  }

  const controller = new AbortController();
  const progress: DownloadProgress = {
    modelId,
    status: 'downloading',
    percent: 0,
    downloadedBytes: 0,
    totalBytes: model.sizeBytes || 1,
    speedBytesSec: 0,
  };

  activeDownloads.set(modelId, { controller, progress });

  try {
    const res = await fetch(model.downloadUrl, {
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Download HTTP error ${res.status}: ${res.statusText}`);
    }

    const contentLength = Number(res.headers.get('content-length')) || model.sizeBytes || 1;
    progress.totalBytes = contentLength;

    if (!res.body) {
      throw new Error('Response body stream is null');
    }

    const reader = res.body.getReader();
    const writer = fs.createWriteStream(partFile);

    let downloaded = 0;
    let lastTime = Date.now();
    let bytesSinceLast = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        writer.write(Buffer.from(value));
        downloaded += value.length;
        bytesSinceLast += value.length;

        const now = Date.now();
        if (now - lastTime >= 500) {
          progress.downloadedBytes = downloaded;
          progress.percent = Math.min(99, Math.round((downloaded / contentLength) * 100));
          progress.speedBytesSec = Math.round((bytesSinceLast / (now - lastTime)) * 1000);
          lastTime = now;
          bytesSinceLast = 0;
          if (onProgress) onProgress(progress);
        }
      }
    }

    await new Promise((resolve) => writer.end(resolve));

    // Rename .part to .gguf
    fs.renameSync(partFile, targetFile);

    progress.status = 'completed';
    progress.percent = 100;
    progress.downloadedBytes = contentLength;
    progress.speedBytesSec = 0;
    if (onProgress) onProgress(progress);

    activeDownloads.delete(modelId);
    return progress;
  } catch (err) {
    if (controller.signal.aborted) {
      progress.status = 'cancelled';
    } else {
      progress.status = 'error';
      progress.error = err instanceof Error ? err.message : String(err);
    }
    try {
      if (fs.existsSync(partFile)) fs.unlinkSync(partFile);
    } catch {
      // Ignore cleanup error
    }
    activeDownloads.delete(modelId);
    if (onProgress) onProgress(progress);
    throw err;
  }
}
