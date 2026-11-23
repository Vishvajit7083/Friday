import { useEffect, useState } from 'react';
import {
  Camera,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderPlus,
  FolderSearch,
  Globe,
  Pause,
  Play,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import { formatBytes } from '../../core/fileIndex';
import type {
  AssistantSettings,
  GroundingSource,
  IndexedFileItem,
  ResearchMode,
} from '../../core/types';

const SCREEN_ANALYSIS_PRESETS = [
  {
    id: 'general',
    label: 'Analyze Screen Window',
    prompt: 'Explain what is visible on this screen, identify active UI or errors, and summarize key information.',
  },
  {
    id: 'error',
    label: 'Explain Error',
    prompt: 'Inspect this screen capture for error messages, stack traces, or warnings and explain how to fix them.',
  },
  {
    id: 'chart',
    label: 'Analyze Chart',
    prompt: 'Analyze charts, graphs, metrics, or tables visible on screen and summarize the key trends and numbers.',
  },
  {
    id: 'ocr',
    label: 'Read Visible Text',
    prompt: 'Transcribe all important visible text on this screen cleanly and preserve structured sections.',
  },
] as const;

const RESEARCH_MODES: Array<{ id: ResearchMode; label: string }> = [
  { id: 'web', label: 'General Web' },
  { id: 'news', label: 'Latest News' },
  { id: 'docs', label: 'Technical Docs' },
  { id: 'video', label: 'Video & Talks' },
];

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
  const [selectedPreview, setSelectedPreview] = useState<{
    path: string;
    name: string;
    content: string;
    sizeBytes: number;
  } | null>(null);
  const [fileQuestion, setFileQuestion] = useState('');
  const [fileSummary, setFileSummary] = useState<string | null>(null);
  const [summarizingFile, setSummarizingFile] = useState(false);
  const [mediaAnalysis, setMediaAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderStatus, setFolderStatus] = useState<string | null>(null);

  const fetchFiles = async (q = query, cat = category) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/files?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`
      );
      const data = await res.json();
      setFiles(data.files ?? []);
      setDuplicates(data.duplicates ?? []);
      setTotalIndexed(data.totalIndexed ?? 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [settings.pausedIndexing, settings.allowedFolders.length]);

  const handleOpenPreview = async (file: IndexedFileItem) => {
    setFileSummary(null);
    try {
      const res = await fetch('/api/files/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: file.path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read file');
      setSelectedPreview({ ...data, path: file.path });
    } catch (err) {
      setSelectedPreview({
        path: file.path,
        name: file.name,
        content: (err as Error).message,
        sizeBytes: file.sizeBytes,
      });
    }
  };

  const handleOpenInDefaultApp = async (filePath: string) => {
    try {
      const res = await fetch('/api/files/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      setFolderStatus(data.detail || (res.ok ? 'Opened file in default OS handler.' : data.error));
    } catch (err) {
      setFolderStatus((err as Error).message);
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

  const handleAnalyzeUploadedMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
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

      const res = await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data,
          mimeType: file.type || 'application/octet-stream',
          prompt: `Analyze "${file.name}". Extract visible text, summarize key points, or describe visual objects.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setMediaAnalysis(data.analysis);
    } catch (err) {
      setMediaAnalysis(`Error: ${(err as Error).message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCaptureScreen = async (
    promptText = 'Explain what is visible on this screen, identify active UI or errors, and summarize key information.'
  ) => {
    if (!settings.screenCaptureConsent) {
      setMediaAnalysis('Enable Explicit Screen Capture Permission first before capturing your screen.');
      return;
    }
    setAnalyzing(true);
    setMediaAnalysis(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach((t) => t.stop());

      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      const res = await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data,
          mimeType: 'image/png',
          prompt: promptText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Screen analysis failed');
      setMediaAnalysis(data.analysis);
    } catch (err) {
      setMediaAnalysis(`Screen capture cancelled or unavailable: ${(err as Error).message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCreatePermittedFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const base = settings.allowedFolders[0];
    const targetPath = `${base}/${newFolderName.trim().replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const res = await fetch('/api/files/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: targetPath, confirmCreate: true }),
    });
    const data = await res.json();
    if (res.ok) {
      setFolderStatus(`Created folder: ${data.path}`);
      setNewFolderName('');
    } else {
      setFolderStatus(data.error);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Personal File, Screen & Multimedia Intelligence
          </h2>
          <p className="text-sm text-slate-400">
            Permission-gated index ({totalIndexed} files across {settings.allowedFolders.length} permitted folder)
          </p>
        </div>

        <button
          type="button"
          onClick={() => onUpdateSettings({ pausedIndexing: !settings.pausedIndexing })}
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

      {/* Natural Language Search Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          fetchFiles(query, category);
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
            fetchFiles(query, next);
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
              onClick={() => handleCaptureScreen(preset.prompt)}
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

      {(analyzing || mediaAnalysis) && (
        <div className="p-4 rounded-xl border border-indigo-400/30 bg-slate-900/90 space-y-2">
          <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Vision & Media Intelligence Output</span>
          </div>
          <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
            {analyzing ? 'Analyzing media payload with Gemini multimodal intelligence...' : mediaAnalysis}
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
            <p className="text-xs text-slate-400">Scanning permitted directories...</p>
          ) : files.length === 0 ? (
            <p className="text-xs text-slate-400">
              {settings.pausedIndexing
                ? 'Indexing is paused. Resume indexing to search files.'
                : 'No files matched your query.'}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {files.slice(0, 40).map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => handleOpenPreview(file)}
                  className="w-full text-left p-2.5 rounded-lg bg-slate-900/75 border border-slate-800 hover:border-cyan-400/40 transition-colors"
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

          {/* Safe Folder Creation */}
          <form onSubmit={handleCreatePermittedFolder} className="pt-2 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder in workspace..."
              aria-label="New workspace folder name"
              className="flex-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-400/40"
            >
              <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Create</span>
            </button>
          </form>
          {folderStatus && <p className="text-[11px] text-cyan-300">{folderStatus}</p>}
        </div>

        {/* File Preview & AI Summarize Pane */}
        <div className="rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 min-w-0">
              <FileText className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
              <span className="truncate">{selectedPreview ? selectedPreview.name : 'Document Preview'}</span>
            </span>
            {selectedPreview && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenInDefaultApp(selectedPreview.path)}
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
                <div className="p-3 rounded-lg border border-cyan-500/25 bg-cyan-950/35 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {summarizingFile ? 'Analyzing file contents with F.R.I.D.A.Y....' : fileSummary}
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

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() && !url.trim()) return;
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
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-cyan-300">Research Synthesis</h3>
            <button
              type="button"
              onClick={handleExportMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>Export Markdown Report</span>
            </button>
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
