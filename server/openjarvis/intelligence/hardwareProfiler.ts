import os from 'os';
import { execSync } from 'child_process';
import type { HardwareProfile, ModelTier } from '../types.ts';

let cachedProfile: HardwareProfile | null = null;
let lastProfiledTime = 0;

export function profileSystemHardware(forceFresh = false): HardwareProfile {
  const now = Date.now();
  if (!forceFresh && cachedProfile && now - lastProfiledTime < 60000) {
    return cachedProfile;
  }

  const cpus = os.cpus() || [];
  const logicalCores = cpus.length || 1;
  const cpuModel = cpus[0]?.model || 'Standard Multi-Core Processor';
  const architecture = os.arch();
  const totalRamMb = Math.round(os.totalmem() / (1024 * 1024));
  const freeRamMb = Math.round(os.freemem() / (1024 * 1024));
  const platform = (process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux')
    ? process.platform
    : 'win32';

  // Physical cores heuristic
  const physicalCores = Math.max(1, Math.floor(logicalCores / (cpuModel.toLowerCase().includes('intel') || cpuModel.toLowerCase().includes('amd') ? 2 : 1)));

  // Instruction set support
  let hasAvx2 = false;
  let hasAvx512 = false;
  let hasNeon = architecture.includes('arm');
  let hasFp16 = false;

  try {
    if (platform === 'linux') {
      const cpuInfo = execSync('cat /proc/cpuinfo 2>/dev/null', { timeout: 1000 }).toString();
      hasAvx2 = cpuInfo.includes('avx2');
      hasAvx512 = cpuInfo.includes('avx512');
      hasFp16 = cpuInfo.includes('f16c') || cpuInfo.includes('fp16');
    } else if (platform === 'win32') {
      // Modern x64 processors from 2014+ have AVX2
      hasAvx2 = architecture === 'x64';
    } else if (platform === 'darwin') {
      hasNeon = architecture === 'arm64';
      hasAvx2 = architecture === 'x64';
    }
  } catch {
    hasAvx2 = architecture === 'x64';
  }

  // GPU detection
  let gpuName = 'DirectX / Integrated Graphics';
  let vramMb = 1024;

  try {
    if (platform === 'win32') {
      const out = execSync('powershell.exe -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name" 2>nul', { timeout: 1500 }).toString().trim();
      if (out) {
        gpuName = out.split('\n')[0].trim();
        if (/rtx|gtx|radeon|rx|geforce/i.test(gpuName)) {
          vramMb = 4096;
        }
      }
    } else if (platform === 'linux') {
      const out = execSync('lspci 2>/dev/null | grep -i -E "vga|3d" || true', { timeout: 1000 }).toString().trim();
      if (out) {
        gpuName = out.split(':').slice(-1)[0]?.trim() || 'Linux Render Node';
        if (/nvidia/i.test(gpuName)) {
          vramMb = 4096;
        }
      }
    }
  } catch {
    // Graceful fallback
  }

  // Determine model tier recommendation
  let recommendedTier: ModelTier = 'ultra_light';
  let recommendedModelId = 'friday-local-core';

  if (totalRamMb >= 16000 && (vramMb >= 4000 || logicalCores >= 8)) {
    recommendedTier = 'standard';
    recommendedModelId = 'friday-local-core'; // always zero-download by default
  } else if (totalRamMb >= 8000) {
    recommendedTier = 'light';
    recommendedModelId = 'friday-local-core';
  } else {
    recommendedTier = 'ultra_light';
    recommendedModelId = 'friday-local-core';
  }

  const profile: HardwareProfile = {
    cpuModel,
    architecture,
    logicalCores,
    physicalCores,
    totalRamMb,
    freeRamMb,
    gpuName,
    vramMb,
    hasAvx2,
    hasAvx512,
    hasNeon,
    hasFp16,
    platform,
    recommendedTier,
    recommendedModelId,
  };

  cachedProfile = profile;
  lastProfiledTime = now;
  return profile;
}
