import { PDFParse } from 'pdf-parse';

export interface ParsedPdfResult {
  text: string;
  numPages: number;
  title?: string;
  author?: string;
  isScannedImageOnly: boolean;
}

export async function extractPdfTextFromBuffer(buffer: Buffer): Promise<ParsedPdfResult> {
  const parser = new PDFParse({ data: buffer });
  try {
    const [textResult, infoResult] = await Promise.all([
      parser.getText(),
      parser.getInfo().catch(() => null),
    ]);

    const rawText = (textResult?.text || '').replace(/\r\n/g, '\n').trim();
    const numPages =
      typeof infoResult?.total === 'number'
        ? infoResult.total
        : Array.isArray(textResult?.pages)
          ? textResult.pages.length
          : 0;
    const isScannedImageOnly = numPages > 0 && rawText.replace(/\s+/g, '').length < 25;

    const infoMap = (infoResult?.info || {}) as Record<string, unknown>;
    return {
      text: rawText,
      numPages,
      title: typeof infoMap.Title === 'string' && infoMap.Title.trim() ? infoMap.Title.trim() : undefined,
      author: typeof infoMap.Author === 'string' && infoMap.Author.trim() ? infoMap.Author.trim() : undefined,
      isScannedImageOnly,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
