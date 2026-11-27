import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  Globe,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { formatBytes } from '../../core/fileIndex';
import type {
  AssistantSettings,
  FileIndexerProgress,
  FileIndexerStatus,
  FileMediaMetadata,
  GroundingSource,
  IndexedFileItem,
  ResearchMode,
  VisualAnalysisOperationType,
  VisualAnalysisRequest,
} from '../../core/types';

const SCREEN_ANALYSIS_PRESETS: Array<{
  id: string;
  operationType: VisualAnalysisOperationType;
  label: string;
  prompt: string;
}> = [
  {
    id: 'general',
    operationType: 'screen_analysis',
    label: 'Analyze Screen Window',
    prompt: 'Explain what is visible on this screen, identify active UI or errors, and summarize key information.',
  },
  {
    id: 'error',
    operationType: 'error_analysis',
    label: 'Explain Error',
    prompt: 'Inspect this screen capture for error messages, stack traces, or warnings and explain how to fix them.',
  },
  {
    id: 'chart',
    operationType: 'chart_analysis',
    label: 'Analyze Chart',
    prompt: 'Analyze charts, graphs, metrics, or tables visible on screen and summarize the key trends and numbers.',
  },
  {
    id: 'ocr',
    operationType: 'text_extraction',
    label: 'Read Visible Text',
    prompt: 'Transcribe all important visible text on this screen cleanly and preserve structured sections.',
  },
];

const RESEARCH_MODES: Array<{ id: ResearchMode; label: string }> = [
  { id: 'web', label: 'General Web' },
  { id: 'news', label: 'Latest News' },
  { id: 'docs', label: 'Technical Docs' },
  { id: 'video', label: 'Video & Talks' },
];

const STATUS_BADGE_MAP: Record<FileIndexerStatus, { label: string; tone: string }> = {
  not_configured: {
    label: 'No Folder Permitted',
    tone: 'bg-slate-800/80 text-slate-300 border-slate-700',
  },
  permission_required: {
    label: 'Permission Required',
    tone: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  },
  ready: {
    label: 'Ready',
    tone: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40',
  },
  indexing: {
    label: 'Indexing',
    tone: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/50',
  },
  paused: {
    label: 'Paused',
    tone: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  },
  completed: {
    label: 'Index Complete',
    tone: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  },
  failed: {
    label: 'Index Failed',
    tone: 'bg-rose-500/15 text-rose-200 border-rose-500/40',
  },
  permission_denied: {
    label: 'Access Denied',
    tone: 'bg-rose-500/15 text-rose-200 border-rose-500/40',
  },
};

export function FileExplorerView({
  settings,
  onUpdateSettings,
}: {
  settings: AssistantSettings;
  onUpdateSettings: (patch: Partial<AssistantSettings>) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | IndexedFileItem['category']>('all');
  const [files, setFiles] = useState<IndexedFileItem[]>([]);
  const [duplicates, setDuplicates] = useState<IndexedFileItem[][]>([]);
  const [totalIndexed, setTotalIndexed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [indexerProgress, setIndexerProgress] = useState<FileIndexerProgress | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<{
    path: string;
    name: string;
    content: string;
    sizeBytes: number;
    modifiedAt?: string;
    createdAt?: string;
    extension?: string;
    category?: IndexedFileItem['category'];
    mediaMeta?: FileMediaMetadata;
  } | null>(null);
  const [fileQuestion, setFileQuestion] = useState('');
  const [fileSummary, setFileSummary] = useState<string | null>(null);
  const [summarizingFile, setSummarizingFile] = useState(false);
  const [mediaAnalysis, setMediaAnalysis] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastUploadedMedia, setLastUploadedMedia] = useState<{
    base64Data: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [copiedMedia, setCopiedMedia] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const [folderPathInput, setFolderPathInput] = useState('');
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [selectedParentFolder, setSelectedParentFolder] = useState(settings.allowedFolders[0] || '');
  const [newFolderName, setNewFolderName] = useState('');
  const [folderStatus, setFolderStatus] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [createFolderFeedback, setCreateFolderFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const prevStatusRef = useRef<FileIndexerStatus | null>(null);

  useEffect(() => {
    if (settings.allowedFolders.length === 0) {
      setSelectedParentFolder('');
    } else if (!settings.allowedFolders.includes(selectedParentFolder)) {
      setSelectedParentFolder(settings.allowedFolders[0]);
    }
  }, [settings.allowedFolders, selectedParentFolder]);

  const fetchFiles = async (q = query, cat = category) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/files?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load indexed files.');
      setFiles(data.files ?? []);
      setDuplicates(data.duplicates ?? []);
      setTotalIndexed(data.totalIndexed ?? 0);
      if (data.progress) {
        setIndexerProgress(data.progress);
      }
    } catch (err) {
      setFolderError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fetchIndexerStatus = async () => {
    try {
      const res = await fetch('/api/files/status');
      if (!res.ok) return;
      const data = (await res.json()) as FileIndexerProgress;
      setIndexerProgress(data);
    } catch {
      // Ignore transient poll errors
    }
  };

  useEffect(() => {
    void fetchFiles();
  }, [settings.pausedIndexing, settings.allowedFolders.length]);

  useEffect(() => {
    const currentStatus = indexerProgress?.status ?? null;
    if (prevStatusRef.current === 'indexing' && currentStatus && currentStatus !== 'indexing') {
      void fetchFiles(query, category);
    }
    prevStatusRef.current = currentStatus;

    if (currentStatus !== 'indexing') return;
    const timer = window.setInterval(() => {
      void fetchIndexerStatus();
    }, 1200);
    return () => window.clearInterval(timer);
  }, [indexerProgress?.status]);

  const handleTogglePauseResume = async () => {
    setFolderError(null);
    const willPause = !settings.pausedIndexing;
    try {
      const res = await fetch(willPause ? '/api/files/pause' : '/api/files/resume', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.progress) setIndexerProgress(data.progress);
    } catch {
      // Fall back to settings update
    }
    onUpdateSettings({ pausedIndexing: willPause });
  };

  const handleReindex = async () => {
    setFolderError(null);
    setFolderStatus(null);
    try {
      const res = await fetch('/api/files/reindex', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start re-index.');
      if (data.progress) setIndexerProgress(data.progress);
      if (settings.pausedIndexing) {
        onUpdateSettings({ pausedIndexing: false });
      }
      setFolderStatus('Started fresh background indexing across permitted folders.');
      window.setTimeout(() => void fetchFiles(query, category), 600);
    } catch (err) {
      setFolderError((err as Error).message);
    }
  };

  const handleCancelIndexing = async () => {
    try {
      const res = await fetch('/api/files/cancel', { method: 'POST' });
      const data = await res.json();
      if (data.progress) setIndexerProgress(data.progress);
      setFolderStatus('Indexing run stopped. Previously indexed entries remain available.');
    } catch (err) {
      setFolderError((err as Error).message);
    }
  };

  const handleAddPermittedFolder = async (folderPath: string) => {
    const clean = folderPath.trim();
    if (!clean) {
      setFolderError('Enter or select a valid folder path.');
      return;
    }
    setFolderSubmitting(true);
    setFolderError(null);
    setFolderStatus(null);
    try {
      const res = await fetch('/api/files/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to authorize folder.');
      if (Array.isArray(data.allowedFolders)) {
        onUpdateSettings({ allowedFolders: data.allowedFolders });
      }
      if (data.progress) {
        setIndexerProgress(data.progress);
      }
      setFolderPathInput('');
      setFolderStatus(
        data.added
          ? `Authorized and indexing folder: ${data.folder}`
          : `Folder already authorized: ${data.folder}`
      );
      window.setTimeout(() => void fetchFiles(query, category), 400);
    } catch (err) {
      setFolderError((err as Error).message);
    } finally {
      setFolderSubmitting(false);
    }
  };

  const handleSelectNativeFolder = async () => {
    setFolderError(null);
    if (window.fridayDesktop?.selectFolder) {
      const result = await window.fridayDesktop.selectFolder();
      if (!result.canceled && result.folderPath) {
        await handleAddPermittedFolder(result.folderPath);
      } else if (result.error) {
        setFolderError(result.error);
      }
      return;
    }
    folderInputRef.current?.focus();
    setFolderStatus('Type a local folder path in the box and click "Add Folder" (native dialog runs in Windows EXE).');
  };

  const handleRemovePermittedFolder = async (folderPath: string) => {
    setFolderError(null);
    setFolderStatus(null);
    try {
      const res = await fetch('/api/files/folders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove folder.');
      if (Array.isArray(data.allowedFolders)) {
        onUpdateSettings({ allowedFolders: data.allowedFolders });
      }
      if (data.progress) {
        setIndexerProgress(data.progress);
      }
      setFolderStatus(`Removed folder access and cleared its index: ${folderPath}`);
      await fetchFiles(query, category);
    } catch (err) {
      setFolderError((err as Error).message);
    }
  };

  const handleOpenPreview = async (file: IndexedFileItem) => {
    setFileSummary(null);
    setFolderError(null);
    try {
      const res = await fetch('/api/files/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: file.path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read file');
      setSelectedPreview({
        ...data,
        path: data.path || file.path,
        category: data.category || file.category,
        extension: data.extension || file.extension,
      });
    } catch (err) {
      setSelectedPreview({
        path: file.path,
        name: file.name,
        content: (err as Error).message,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
        createdAt: file.createdAt,
        extension: file.extension,
        category: file.category,
      });
    }
  };

  const handleOpenInDefaultApp = async (filePath: string) => {
    setFolderError(null);
    try {
      if (window.fridayDesktop?.openFile) {
        const result = await window.fridayDesktop.openFile(filePath);
        if (result.opened) {
          setFolderStatus(result.detail || 'Opened file in default Windows app.');
        } else {
          setFolderError(result.detail || 'Unable to open file.');
        }
        return;
      }
      const res = await fetch('/api/files/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      if (!res.ok || data.opened === false) {
        setFolderError(data.error || data.detail || 'Unable to open file.');
      } else {
        setFolderStatus(data.detail || 'Opened file in default OS handler.');
      }
    } catch (err) {
      setFolderError((err as Error).message);
    }
  };

  const handleRevealInExplorer = async (filePath: string) => {
    setFolderError(null);
    try {
      if (window.fridayDesktop?.revealFileInExplorer) {
        const result = await window.fridayDesktop.revealFileInExplorer(filePath);
        if (result.revealed) {
          setFolderStatus(result.message || 'Highlighted file in Windows Explorer.');
        } else {
          setFolderError(result.message || 'Unable to open file location.');
        }
        return;
      }
      const res = await fetch('/api/files/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      if (!res.ok || data.revealed === false) {
        setFolderError(data.error || data.message || 'Unable to reveal file location.');
      } else {
        setFolderStatus(data.message || 'Opened file location.');
      }
    } catch (err) {
      setFolderError((err as Error).message);
    }
  };

  const handleSummarizeFile = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedPreview) return;
    setSummarizingFile(true);
    setFileSummary(null);
    try {
      const res = await fetch('/api/files/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: selectedPreview.path,
          question: fileQuestion.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to summarize file');
      setFileSummary(data.summary);
    } catch (err) {
      setFileSummary(`Unable to summarize file: ${(err as Error).message}`);
    } finally {
      setSummarizingFile(false);
    }
  };

  const runVisionAnalysisPayload = async (payload: VisualAnalysisRequest) => {
    setAnalyzing(true);
    setMediaError(null);
    setMediaAnalysis(null);
    try {
      const res = await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || data.analysis || 'Analysis failed');
      }
      setMediaAnalysis(data.analysis);
    } catch (err) {
      setMediaError((err as Error).message || 'Media analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzeUploadedMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAnalyzing(true);
    setMediaError(null);
    setMediaAnalysis(null);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          resolve(result.split(',')[1] || '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const lowerName = file.name.toLowerCase();
      let detectedMime = file.type || 'application/octet-stream';
      if (detectedMime === 'application/octet-stream') {
        if (lowerName.endsWith('.pdf')) detectedMime = 'application/pdf';
        else if (lowerName.endsWith('.wav')) detectedMime = 'audio/wav';
        else if (lowerName.endsWith('.mp3')) detectedMime = 'audio/mpeg';
        else if (lowerName.endsWith('.png')) detectedMime = 'image/png';
        else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) detectedMime = 'image/jpeg';
      }

      let operationType: VisualAnalysisOperationType = 'image_analysis';
      if (detectedMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
        operationType = 'pdf_analysis';
      } else if (detectedMime.startsWith('audio/') || /\.(wav|mp3|ogg|m4a|flac|webm)$/i.test(lowerName)) {
        operationType = 'audio_analysis';
      }

      const uploaded = {
        base64Data,
        mimeType: detectedMime,
        name: file.name,
      };
      setLastUploadedMedia(uploaded);
      await runVisionAnalysisPayload({
        operationType,
        base64Data: uploaded.base64Data,
        mimeType: uploaded.mimeType,
        fileName: uploaded.name,
      });
    } catch (err) {
      setMediaError(`Unable to read uploaded file: ${(err as Error).message}`);
      setAnalyzing(false);
    }
  };

  const handleCaptureScreen = async (
    operationType: VisualAnalysisOperationType = 'screen_analysis',
    _promptText?: string
  ) => {
    // Allow re-analyzing an already uploaded image with Error/Chart/OCR mode when screen capture consent is not toggled
    if (!settings.screenCaptureConsent && lastUploadedMedia && lastUploadedMedia.mimeType.startsWith('image/')) {
      await runVisionAnalysisPayload({
        operationType,
        base64Data: lastUploadedMedia.base64Data,
        mimeType: lastUploadedMedia.mimeType,
        fileName: lastUploadedMedia.name,
      });
      return;
    }

    if (!settings.screenCaptureConsent) {
      setMediaError(
        'Enable "Explicit Screen Capture Permission" to capture your live display, or upload an image/PDF/audio file first.'
      );
      return;
    }

    setAnalyzing(true);
    setMediaError(null);
    setMediaAnalysis(null);
    let stream: MediaStream | null = null;
    try {
      // 1. Prefer native Electron desktopCapturer / Windows GDI capture inside Windows EXE
      if (window.fridayDesktop?.captureScreen) {
        const activeWin = await window.fridayDesktop.getActiveWindow?.().catch(() => undefined);
        const cap = await window.fridayDesktop.captureScreen({
          target: operationType === 'screen_analysis' ? 'window' : 'screen',
        });
        if (!cap.ok || !cap.base64Data) {
          throw new Error(cap.error || cap.detail || 'Native Windows screen capture failed.');
        }
        setLastUploadedMedia({
          base64Data: cap.base64Data,
          mimeType: cap.mimeType || 'image/png',
          name: cap.sourceName || 'screen-capture.png',
        });
        await runVisionAnalysisPayload({
          operationType,
          base64Data: cap.base64Data,
          mimeType: cap.mimeType || 'image/png',
          fileName: cap.sourceName || 'screen-capture.png',
          metadata: {
            sourceName: cap.sourceName,
            width: cap.width,
            height: cap.height,
            userConfirmedConsent: true,
            activeWindow: activeWin?.ok
              ? { title: activeWin.title, processName: activeWin.processName, pid: activeWin.pid }
              : undefined,
          },
        });
        return;
      }

      // 2. Fallback to Web getDisplayMedia when running in browser preview
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 2000);
        const onReady = () => {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            window.clearTimeout(timer);
            resolve();
          }
        };
        video.onloadedmetadata = onReady;
        video.onplaying = onReady;
      });
      await video.play().catch(() => {});

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      setLastUploadedMedia({ base64Data, mimeType: 'image/png', name: 'screen-capture.png' });
      await runVisionAnalysisPayload({
        operationType,
        base64Data,
        mimeType: 'image/png',
        fileName: 'screen-capture.png',
        metadata: {
          width: canvas.width,
          height: canvas.height,
          userConfirmedConsent: true,
        },
      });
    } catch (err) {
      setMediaError(`Screen capture cancelled or unavailable: ${(err as Error).message}`);
      setAnalyzing(false);
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
    }
  };

  const handleCreatePermittedFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateFolderFeedback(null);
    const folderName = newFolderName.trim();
    if (!folderName) {
      setCreateFolderFeedback({ ok: false, text: 'Enter a folder name first.' });
      return;
    }
    const parentFolder = selectedParentFolder || settings.allowedFolders[0] || '';
    if (!parentFolder) {
      setCreateFolderFeedback({
        ok: false,
        text: 'Authorize at least one permitted folder before creating a subfolder.',
      });
      return;
    }
    try {
      const res = await fetch('/api/files/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentFolder, folderName, confirmCreate: true }),
      });
      const data = await res.json();
      if (res.ok && data.created) {
        setCreateFolderFeedback({ ok: true, text: `Created verified folder: ${data.path}` });
        setNewFolderName('');
        void fetchFiles(query, category);
      } else {
        setCreateFolderFeedback({ ok: false, text: data.error || 'Failed to create folder.' });
      }
    } catch (err) {
      setCreateFolderFeedback({ ok: false, text: (err as Error).message });
    }
  };

  const effectiveStatus: FileIndexerStatus =
    indexerProgress?.status ||
    (settings.allowedFolders.length === 0
      ? 'not_configured'
      : settings.pausedIndexing
        ? 'paused'
        : 'ready');
  const statusBadge = STATUS_BADGE_MAP[effectiveStatus] || STATUS_BADGE_MAP.ready;
  const folderStatuses = indexerProgress?.folderStatuses || [];
  const pct =
    indexerProgress && indexerProgress.totalFolders > 0
      ? Math.min(100, Math.round((indexerProgress.processedFolders / indexerProgress.totalFolders) * 100))
      : 0;

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Personal File, Screen & Multimedia Intelligence
          </h2>
          <p className="text-sm text-slate-400">
            Permission-gated index ({totalIndexed} files across {settings.allowedFolders.length} permitted{' '}
            {settings.allowedFolders.length === 1 ? 'folder' : 'folders'})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border ${statusBadge.tone}`}>
            {effectiveStatus === 'indexing' && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
            <span>{statusBadge.label}</span>
          </span>

          <button
            type="button"
            onClick={() => void handleSelectNativeFolder()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
          >
            <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Select Folder</span>
          </button>

          <button
            type="button"
            onClick={() => void handleReindex()}
            disabled={settings.allowedFolders.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${effectiveStatus === 'indexing' ? 'animate-spin text-cyan-400' : ''}`} aria-hidden="true" />
            <span>Re-index</span>
          </button>

          {effectiveStatus === 'indexing' && (
            <button
              type="button"
              onClick={() => void handleCancelIndexing()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-200 border border-rose-500/40"
            >
              <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Stop</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleTogglePauseResume()}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border ${
              settings.pausedIndexing
                ? 'bg-amber-500/15 text-amber-200 border-amber-500/40'
                : 'bg-slate-900 text-slate-200 border-slate-700'
            }`}
          >
            {settings.pausedIndexing ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{settings.pausedIndexing ? 'Resume Indexing' : 'Pause Indexing'}</span>
          </button>
        </div>
      </div>

      {/* Permitted Folders & Real-Time Indexer Progress */}
      <div className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Folder className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Authorized Local Folders</span>
          </span>
          {indexerProgress && (
            <span className="text-[11px] font-mono-tabular text-slate-400">
              {effectiveStatus === 'indexing'
                ? `Scanning ${indexerProgress.currentFolder || '...'} · ${indexerProgress.filesIndexed} files (${indexerProgress.processedFolders}/${indexerProgress.totalFolders})`
                : indexerProgress.completedAt
                  ? `Last indexed ${new Date(indexerProgress.completedAt).toLocaleTimeString()} · ${indexerProgress.filesIndexed} files`
                  : `${totalIndexed} indexed`}
            </span>
          )}
        </div>

        {effectiveStatus === 'indexing' && (
          <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${Math.max(8, pct)}%` }}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {settings.allowedFolders.length === 0 ? (
            <p className="text-xs text-amber-300">
              No local folders authorized yet. Click "Select Folder" or enter a folder path below (e.g., Desktop or Documents).
            </p>
          ) : (
            settings.allowedFolders.map((folder) => {
              const info = folderStatuses.find(
                (fsItem) => fsItem.path.toLowerCase() === folder.toLowerCase()
              );
              return (
                <div
                  key={folder}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs max-w-full"
                >
                  <span className="font-mono-tabular text-slate-200 truncate max-w-[280px]" title={folder}>
                    {folder}
                  </span>
                  {info && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        info.readable
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {info.readable
                        ? `${info.fileCount} files`
                        : info.exists
                          ? 'Denied'
                          : 'Missing'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleRemovePermittedFolder(folder)}
                    aria-label={`Remove authorized folder ${folder}`}
                    className="text-slate-400 hover:text-rose-300 p-0.5"
                    title="Revoke folder access"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddPermittedFolder(folderPathInput);
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            ref={folderInputRef}
            type="text"
            value={folderPathInput}
            onChange={(e) => setFolderPathInput(e.target.value)}
            placeholder="Or paste Windows/local folder path (e.g. C:\Users\Name\Documents)..."
            aria-label="Authorize local folder path"
            className="flex-1 min-w-[220px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
          />
          <button
            type="submit"
            disabled={folderSubmitting || !folderPathInput.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-100 hover:border-cyan-400/50 disabled:opacity-50"
          >
            {folderSubmitting ? 'Adding...' : 'Add Folder'}
          </button>
        </form>

        {(folderError || indexerProgress?.lastError || folderStatus) && (
          <div
            className={`text-xs px-3 py-2 rounded-lg border flex items-start gap-2 ${
              folderError || indexerProgress?.lastError
                ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-200'
            }`}
          >
            {(folderError || indexerProgress?.lastError) && (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" aria-hidden="true" />
            )}
            <span>{folderError || indexerProgress?.lastError || folderStatus}</span>
          </div>
        )}
      </div>

      {/* Natural Language Search Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void fetchFiles(query, category);
        }}
        className="flex flex-wrap gap-2"
      >
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by filename, content, or natural description (e.g., server, presentation, expenses)..."
            aria-label="Search local files"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100"
          />
        </div>
        <select
          value={category}
          onChange={(e) => {
            const next = e.target.value as 'all' | IndexedFileItem['category'];
            setCategory(next);
            void fetchFiles(query, next);
          }}
          aria-label="Filter file type"
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        >
          <option value="all">All Types</option>
          <option value="document">Documents</option>
          <option value="code">Source Code</option>
          <option value="spreadsheet">Spreadsheets</option>
          <option value="presentation">Presentations</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="audio">Audio</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
        >
          Search Index
        </button>
      </form>

      {/* Screen Intelligence & Multimodal Upload Bar */}
      <div className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span>Analyze Image / Audio / PDF</span>
            <input type="file" onChange={handleAnalyzeUploadedMedia} className="hidden" />
          </label>

          {SCREEN_ANALYSIS_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => void handleCaptureScreen(preset.operationType, preset.prompt)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50"
            >
              <Camera className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.screenCaptureConsent}
            onChange={(e) => onUpdateSettings({ screenCaptureConsent: e.target.checked })}
            className="accent-cyan-400"
          />
          <span>Explicit Screen Capture Permission</span>
        </label>
      </div>

      {(analyzing || mediaAnalysis || mediaError) && (
        <div
          className={`p-4 rounded-xl border space-y-2 ${
            mediaError ? 'border-rose-500/40 bg-rose-950/60' : 'border-indigo-400/30 bg-slate-900/90'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
            <span className={`flex items-center gap-1.5 ${mediaError ? 'text-rose-200' : 'text-indigo-300'}`}>
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {mediaError
                  ? 'Media Intelligence Notice'
                  : lastUploadedMedia
                    ? `Vision & Media Output (${lastUploadedMedia.name})`
                    : 'Vision & Media Intelligence Output'}
              </span>
            </span>
            {mediaAnalysis && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(mediaAnalysis);
                    setCopiedMedia(true);
                    window.setTimeout(() => setCopiedMedia(false), 1500);
                  } catch {
                    // Ignore
                  }
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-200 hover:border-cyan-400/50"
              >
                {copiedMedia ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedMedia ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
          <p className={`text-xs whitespace-pre-wrap leading-relaxed ${mediaError ? 'text-rose-100' : 'text-slate-200'}`}>
            {analyzing
              ? 'Analyzing uploaded image, PDF, audio, or screen payload...'
              : mediaError || mediaAnalysis}
          </p>
        </div>
      )}

      {/* Results & Preview Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <FolderSearch className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              <span>Indexed Results ({files.length})</span>
            </span>
            {duplicates.length > 0 && (
              <span className="text-amber-300 flex items-center gap-1">
                <Copy className="w-3 h-3" aria-hidden="true" />
                {duplicates.length} duplicate group(s)
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-xs text-slate-400">Loading permitted index...</p>
          ) : settings.allowedFolders.length === 0 ? (
            <p className="text-xs text-slate-400">
              Select or add a permitted folder above to scan and search your local files.
            </p>
          ) : files.length === 0 ? (
            <p className="text-xs text-slate-400">
              {settings.pausedIndexing
                ? 'Indexing is paused. Click "Resume Indexing" above to index and search files.'
                : effectiveStatus === 'indexing'
                  ? 'Indexing permitted folders in the background...'
                  : 'No files matched your query.'}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {files.slice(0, 60).map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => void handleOpenPreview(file)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                    selectedPreview?.path === file.path
                      ? 'bg-cyan-500/10 border-cyan-400/50'
                      : 'bg-slate-900/75 border-slate-800 hover:border-cyan-400/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-100 truncate">{file.name}</span>
                    <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    {file.relativePath} · {file.category}
                    {file.matchReason ? ` · ${file.matchReason}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Validated Folder Creation inside Permitted Roots */}
          <form onSubmit={handleCreatePermittedFolder} className="pt-3 border-t border-slate-800 space-y-2">
            {settings.allowedFolders.length > 1 && (
              <select
                value={selectedParentFolder}
                onChange={(e) => setSelectedParentFolder(e.target.value)}
                aria-label="Parent permitted folder"
                className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200"
              >
                {settings.allowedFolders.map((folder) => (
                  <option key={folder} value={folder}>
                    Parent: {folder}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New folder name inside permitted directory..."
                aria-label="New workspace folder name"
                className="flex-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
              />
              <button
                type="submit"
                disabled={settings.allowedFolders.length === 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-400/40 disabled:opacity-40"
              >
                <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Create</span>
              </button>
            </div>
            {createFolderFeedback && (
              <p className={`text-[11px] ${createFolderFeedback.ok ? 'text-cyan-300' : 'text-rose-300'}`}>
                {createFolderFeedback.text}
              </p>
            )}
          </form>
        </div>

        {/* File Preview & AI Summarize Pane */}
        <div className="rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 min-w-0">
              <FileText className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
              <span className="truncate">{selectedPreview ? selectedPreview.name : 'Document Preview'}</span>
            </span>
            {selectedPreview && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleRevealInExplorer(selectedPreview.path)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50"
                >
                  <FolderOpen className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                  <span>Reveal in Explorer</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenInDefaultApp(selectedPreview.path)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-slate-900 border border-slate-700 text-cyan-200 hover:border-cyan-400/50"
                >
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  <span>Open in App</span>
                </button>
                <span className="text-[11px] font-mono-tabular text-slate-400">
                  {formatBytes(selectedPreview.sizeBytes)}
                </span>
              </div>
            )}
          </div>

          {selectedPreview ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span className="font-mono-tabular truncate max-w-full" title={selectedPreview.path}>
                  {selectedPreview.path}
                </span>
                {selectedPreview.modifiedAt && (
                  <span>· Modified {new Date(selectedPreview.modifiedAt).toLocaleString()}</span>
                )}
                {selectedPreview.mediaMeta?.width && selectedPreview.mediaMeta?.height && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                    {selectedPreview.mediaMeta.width}×{selectedPreview.mediaMeta.height}px
                  </span>
                )}
                {selectedPreview.mediaMeta?.pageCount && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                    {selectedPreview.mediaMeta.pageCount} pages
                  </span>
                )}
                {selectedPreview.mediaMeta?.sampleRate && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                    {selectedPreview.mediaMeta.sampleRate} Hz
                    {selectedPreview.mediaMeta.durationSec ? ` · ${selectedPreview.mediaMeta.durationSec}s` : ''}
                  </span>
                )}
              </div>

              <form onSubmit={handleSummarizeFile} className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={fileQuestion}
                  onChange={(e) => setFileQuestion(e.target.value)}
                  placeholder="Optional question about this file..."
                  aria-label="Ask F.R.I.D.A.Y. about this file"
                  className="flex-1 min-w-[180px] px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                />
                <button
                  type="submit"
                  disabled={summarizingFile}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{summarizingFile ? 'Summarizing...' : 'Summarize with F.R.I.D.A.Y.'}</span>
                </button>
              </form>

              {(summarizingFile || fileSummary) && (
                <div className="p-3 rounded-lg border border-cyan-500/25 bg-cyan-950/35 text-xs text-slate-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-cyan-300">Document Analysis</span>
                    {fileSummary && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard?.writeText(fileSummary);
                            setCopiedSummary(true);
                            window.setTimeout(() => setCopiedSummary(false), 1500);
                          } catch {
                            // Ignore
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-200"
                      >
                        {copiedSummary ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {summarizingFile ? 'Analyzing file contents with F.R.I.D.A.Y....' : fileSummary}
                  </div>
                </div>
              )}

              {selectedPreview.category === 'image' && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/90 p-2 flex justify-center">
                  <img
                    src={`/api/files/stream?path=${encodeURIComponent(selectedPreview.path)}`}
                    alt={selectedPreview.name}
                    className="max-h-64 w-auto object-contain rounded"
                  />
                </div>
              )}

              {selectedPreview.category === 'audio' && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/90 p-3">
                  <audio
                    controls
                    preload="metadata"
                    src={`/api/files/stream?path=${encodeURIComponent(selectedPreview.path)}`}
                    className="w-full"
                  />
                </div>
              )}

              {selectedPreview.category === 'video' && (
                <div className="rounded-lg border border-slate-800 bg-black p-1">
                  <video
                    controls
                    preload="metadata"
                    src={`/api/files/stream?path=${encodeURIComponent(selectedPreview.path)}`}
                    className="max-h-64 w-full rounded"
                  />
                </div>
              )}

              <pre className="flex-1 max-h-80 overflow-auto p-3 rounded-lg bg-slate-950/90 border border-slate-800 text-xs font-mono-tabular text-slate-300 whitespace-pre-wrap">
                {selectedPreview.content}
              </pre>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 min-h-[200px]">
              Select any indexed file on the left to inspect its contents securely.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function BrowserIntelligenceView() {
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<ResearchMode>('web');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [copiedResearch, setCopiedResearch] = useState(false);

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() && !url.trim()) {
      setError('Enter a search query or target URL before running research.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/browser/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, url, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Research request failed');
      setSummary(data.summary);
      setSources(data.sources ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportMarkdown = () => {
    if (!summary) return;
    const citationsBlock =
      sources.length > 0
        ? `\n\n## Verified Citations\n${sources.map((s) => `- [${s.title}](${s.uri})`).join('\n')}`
        : '';
    const markdown = `# F.R.I.D.A.Y. Research Briefing (${mode.toUpperCase()})\n\n**Query:** ${
      query || url
    }\n**Generated:** ${new Date().toISOString()}\n\n${summary}${citationsBlock}\n`;

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `friday-research-${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-slate-100">
          Browser & Grounded Web Intelligence
        </h2>
        <p className="text-sm text-slate-400">
          Direct free web search, Wikipedia/documentation synthesis, and public URL reading with verified citations.
        </p>
      </div>

      <form
        onSubmit={handleResearch}
        className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3"
      >
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Research focus mode">
          {RESEARCH_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                mode === item.id
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-400/30'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block space-y-1 text-xs">
            <span className="text-slate-300 font-medium">Search Query or Research Topic</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Best Raspberry Pi 5 edge AI projects in 2026"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100"
            />
          </label>

          <label className="block space-y-1 text-xs">
            <span className="text-slate-300 font-medium">Optional Target URL to Summarize</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
        >
          <Globe className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{loading ? 'Researching Live Web...' : 'Run Grounded Research'}</span>
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/60 text-xs text-rose-200">
          {error}
        </div>
      )}

      {summary && (
        <div className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-cyan-300">Research Synthesis</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(summary);
                    setCopiedResearch(true);
                    window.setTimeout(() => setCopiedResearch(false), 1500);
                  } catch {
                    // Ignore
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50"
              >
                {copiedResearch ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                )}
                <span>{copiedResearch ? 'Copied' : 'Copy Summary'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportMarkdown}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                <span>Export Markdown Report</span>
              </button>
            </div>
          </div>
          <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{summary}</div>

          {sources.length > 0 && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-400">Verified Citations</div>
              <ul className="space-y-1.5">
                {sources.map((src) => (
                  <li key={src.uri}>
                    <a
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{src.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
