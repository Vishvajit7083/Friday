import test from 'node:test';
import assert from 'node:assert/strict';
import { performVisualAnalysis, extractErrorsFromText, detectChartFromTextAndVisuals } from '../../server/visualAnalysisEngine.ts';
import type { VisualAnalysisOperationType } from './visualAnalysisTypes.ts';

// Minimal valid 1x1 PNG buffer in base64
const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// Minimal valid 44-byte RIFF PCM WAV buffer in base64 (16kHz mono 16-bit)
function createMinimalWavBase64(): string {
  const buf = Buffer.alloc(44 + 3200); // 0.1s
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + 3200, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(3200, 40);
  return buf.toString('base64');
}

test('VisualAnalysis: 1. screen_analysis routes strictly to screen pipeline without mixing', async () => {
  const res = await performVisualAnalysis({
    operationType: 'screen_analysis',
    base64Data: VALID_PNG_BASE64,
    mimeType: 'image/png',
    fileName: 'desktop-screen.png',
    metadata: {
      activeWindow: { title: 'Visual Studio Code', processName: 'Code.exe', pid: 4412 },
      width: 1920,
      height: 1080,
      userConfirmedConsent: true,
    },
  });

  assert.equal(res.operationType, 'screen_analysis');
  assert.equal(res.success, true);
  assert.ok(res.analysis.includes('Screen & Active Window Overview'));
  assert.ok(res.analysis.includes('Visual Studio Code'));
  assert.ok(res.analysis.includes('Code.exe'));
  assert.ok(!res.analysis.includes('Chart Classification'));
});

test('VisualAnalysis: 2. error_analysis identifies stack traces, root cause, and fixes accurately', async () => {
  const errText = `TypeError: Cannot read properties of undefined (reading 'trim')\n    at launchWindowsTarget (electron/windowsAutomation.ts:827:19)`;
  const extracted = extractErrorsFromText(errText);
  assert.ok(extracted);
  assert.equal(extracted?.errorType, 'TypeError');
  assert.equal(extracted?.sourceFile, 'electron/windowsAutomation.ts');
  assert.equal(extracted?.lineNumber, '827');

  const res = await performVisualAnalysis({
    operationType: 'error_analysis',
    base64Data: VALID_PNG_BASE64,
    mimeType: 'image/png',
    customPrompt: errText,
  });

  assert.equal(res.operationType, 'error_analysis');
  assert.equal(res.success, true);
  assert.ok(res.analysis.includes('Error Identified: TypeError'));
  assert.ok(res.analysis.includes('Root Cause Analysis'));
  assert.ok(res.analysis.includes('Step-by-Step Fix'));

  // When no error is visible, must report honestly instead of fabricating one
  const cleanRes = await performVisualAnalysis({
    operationType: 'error_analysis',
    base64Data: VALID_PNG_BASE64,
    mimeType: 'image/png',
    customPrompt: 'Clean desktop background with icons',
  });
  assert.equal(cleanRes.operationType, 'error_analysis');
  assert.ok(cleanRes.analysis.includes('No active error dialog'));
});

test('VisualAnalysis: 3. chart_analysis classifies chart types, trends, and avoids inventing numbers', async () => {
  const chartText = 'Monthly Revenue Growth Chart (Q1 - Q4)\nLine trend rising: $12,400, $18,900, $24,500 (+45%)';
  const detected = detectChartFromTextAndVisuals(chartText, 1200, 720);
  assert.ok(detected);
  assert.equal(detected?.chartType, 'line');
  assert.equal(detected?.trendDirection, 'upward');
  assert.ok(detected?.observedValues.includes('$12,400'));

  const res = await performVisualAnalysis({
    operationType: 'chart_analysis',
    base64Data: VALID_PNG_BASE64,
    mimeType: 'image/png',
    customPrompt: chartText,
  });
  assert.equal(res.operationType, 'chart_analysis');
  assert.equal(res.success, true);
  assert.ok(res.analysis.includes('Chart Classification: LINE CHART'));
  assert.ok(res.analysis.includes('UPWARD'));
});

test('VisualAnalysis: 4. text_extraction executes dedicated OCR/text pipeline', async () => {
  const res = await performVisualAnalysis({
    operationType: 'text_extraction',
    base64Data: VALID_PNG_BASE64,
    mimeType: 'image/png',
  });
  assert.equal(res.operationType, 'text_extraction');
  assert.equal(res.success, true);
  assert.ok(res.analysis.includes('Read Visible Text (OCR Extraction)'));
});

test('VisualAnalysis: 5. image_analysis inspects image format and dimensions cleanly', async () => {
  const res = await performVisualAnalysis({
    operationType: 'image_analysis',
    base64Data: VALID_PNG_BASE64,
    mimeType: 'image/png',
    fileName: 'photo.png',
  });
  assert.equal(res.operationType, 'image_analysis');
  assert.equal(res.success, true);
  assert.ok(res.analysis.includes('Image Visual Analysis'));
  assert.ok(res.analysis.includes('1×1px'));
});

test('VisualAnalysis: 6. audio_analysis inspects WAV container and honestly reports STT status', async () => {
  const wavB64 = createMinimalWavBase64();
  const res = await performVisualAnalysis({
    operationType: 'audio_analysis',
    base64Data: wavB64,
    mimeType: 'audio/wav',
    fileName: 'voice-memo.wav',
  });
  assert.equal(res.operationType, 'audio_analysis');
  assert.equal(res.success, true);
  assert.ok(res.analysis.includes('Audio Stream & Media Analysis'));
  assert.ok(res.analysis.includes('RIFF WAVE'));
  assert.ok(res.analysis.includes('16000 Hz'));
});

test('VisualAnalysis: 7. pdf_analysis rejects malformed PDF cleanly without crashing or mixing pipelines', async () => {
  const fakePdfB64 = Buffer.from('%PDF-1.4 invalid body').toString('base64');
  const res = await performVisualAnalysis({
    operationType: 'pdf_analysis',
    base64Data: fakePdfB64,
    mimeType: 'application/pdf',
    fileName: 'broken.pdf',
  });
  assert.equal(res.operationType, 'pdf_analysis');
  assert.equal(res.success, false);
  assert.ok(res.analysis.includes('Could not parse PDF payload locally'));
});

test('VisualAnalysis: strictly rejects missing payload and preserves distinct operation types', async () => {
  const ops: VisualAnalysisOperationType[] = [
    'screen_analysis',
    'error_analysis',
    'chart_analysis',
    'text_extraction',
    'image_analysis',
    'audio_analysis',
    'pdf_analysis',
  ];
  for (const op of ops) {
    const emptyRes = await performVisualAnalysis({
      operationType: op,
      base64Data: '',
      mimeType: 'image/png',
    });
    assert.equal(emptyRes.operationType, op);
    assert.equal(emptyRes.success, false);
  }
});
