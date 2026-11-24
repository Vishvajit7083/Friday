export interface ImageMetadata {
  format: string;
  width?: number;
  height?: number;
  sizeKb: number;
}

export interface WavAudioMetadata {
  isRiffWave: boolean;
  channels?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  durationSec?: number;
  sizeKb: number;
}

export function inspectImageDimensions(buf: Buffer, mimeType: string): ImageMetadata {
  const sizeKb = Math.max(1, Math.round(buf.length / 1024));
  const lower = mimeType.toLowerCase();

  // PNG: 16..24 IHDR width/height big-endian
  if ((lower.includes('png') || buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') && buf.length >= 24) {
    return {
      format: 'PNG',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
      sizeKb,
    };
  }

  // GIF: bytes 6..10 width/height little-endian
  if (buf.length >= 10 && buf.subarray(0, 3).toString('ascii') === 'GIF') {
    return {
      format: 'GIF',
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
      sizeKb,
    };
  }

  // JPEG: scan SOF0/SOF2 markers
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      const len = buf.readUInt16BE(offset + 2);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb)
      ) {
        return {
          format: 'JPEG',
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
          sizeKb,
        };
      }
      if (len < 2) break;
      offset += 2 + len;
    }
    return { format: 'JPEG', sizeKb };
  }

  // WEBP
  if (buf.length >= 30 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    const chunk = buf.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8X' && buf.length >= 30) {
      const width = 1 + buf.readUIntLE(24, 3);
      const height = 1 + buf.readUIntLE(27, 3);
      return { format: 'WebP', width, height, sizeKb };
    }
    return { format: 'WebP', sizeKb };
  }

  return { format: mimeType.replace('image/', '').toUpperCase(), sizeKb };
}

export function inspectWavAudioBuffer(buf: Buffer): WavAudioMetadata {
  const sizeKb = Math.max(1, Math.round(buf.length / 1024));
  if (
    buf.length < 44 ||
    buf.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    buf.subarray(8, 12).toString('ascii') !== 'WAVE'
  ) {
    return { isRiffWave: false, sizeKb };
  }
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const byteRate = buf.readUInt32LE(28);
  const bitsPerSample = buf.readUInt16LE(34);
  const dataSize = Math.max(0, buf.length - 44);
  const durationSec = byteRate > 0 ? Number((dataSize / byteRate).toFixed(1)) : undefined;
  return {
    isRiffWave: true,
    channels,
    sampleRate,
    bitsPerSample,
    durationSec,
    sizeKb,
  };
}
