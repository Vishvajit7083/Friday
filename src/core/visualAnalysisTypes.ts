// Visual and Multimodal Analysis Operation Types & Contracts

export type VisualAnalysisOperationType =
  | 'screen_analysis'
  | 'error_analysis'
  | 'chart_analysis'
  | 'text_extraction'
  | 'image_analysis'
  | 'audio_analysis'
  | 'pdf_analysis';

export interface VisualAnalysisRequest {
  operationType: VisualAnalysisOperationType;
  base64Data: string;
  mimeType: string;
  fileName?: string;
  customPrompt?: string;
  metadata?: {
    activeWindow?: {
      title?: string;
      processName?: string;
      pid?: number;
    };
    sourceName?: string;
    userConfirmedConsent?: boolean;
    width?: number;
    height?: number;
  };
}

export interface VisualAnalysisResponse {
  operationType: VisualAnalysisOperationType;
  success: boolean;
  title: string;
  analysis: string;
  extractedText?: string;
  structuredDetails?: Record<string, unknown>;
  modelUsed: string;
  durationMs: number;
  error?: string;
  limitations?: string[];
}
