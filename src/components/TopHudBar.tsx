import { useEffect, useState } from 'react';
import {
  Battery,
  Bot,
  ChevronDown,
  Cpu,
  Home,
  Maximize2,
  Menu,
  Minus,
  Volume2,
  VolumeX,
  Wifi,
  Workflow,
  X,
} from 'lucide-react';
import type { NavSection, SystemTelemetry } from '../core/types';

interface TopHudBarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  userName: string;
  telemetry: SystemTelemetry | null;
  autoSpeakReplies: boolean;
  isSpeaking: boolean;
  onToggleAutoSpeak: () => void;
  onStopSpeaking: () => void;
  onHideToDesktop: () => void;
  onOpenMobileMenu: () => void;
}

const TOP_TABS: Array<{ id: NavSection; label: string; icon: typeof Home }> = [
  { id: 'command-center', label: 'Command Center', icon: Home },
  { id: 'ai-core', label: 'AI Core', icon: Cpu },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'tasks-workflows', label: 'Workflows', icon: Workflow },
];

export function TopHudBar({
  activeSection,
  onSelectSection,
  userName,
  telemetry,
  autoSpeakReplies,
  isSpeaking,
  onToggleAutoSpeak,
  onStopSpeaking,
  onHideToDesktop,
  onOpenMobileMenu,
}: TopHudBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const formattedTime = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const formattedDate = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const batteryPct = telemetry?.batteryPercent ?? null;

  return (
    <header className="relative z-20 shrink-0 px-3 sm:px-4 pt-2.5 pb-1.5 flex items-center justify-between gap-3 border-b border-cyan-500/20 bg-[#040a18]/88">
      {/* Left: Brand Emblem + Mobile Toggle + 4 HUD Tabs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Toggle navigation menu"
          className="md:hidden p-2 rounded-lg hud-panel text-cyan-300"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* F.R.I.D.A.Y. Arc Emblem & Wordmark */}
        <button
          type="button"
          onClick={() => onSelectSection('command-center')}
          className="flex items-center gap-2.5 text-left shrink-0 group"
        >
          <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 48 48" className="w-10 h-10" aria-hidden="true">
              <defs>
                <radialGradient id="topCoreGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.95" />
                  <stop offset="65%" stopColor="#0284c7" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="24" cy="24" r="22" fill="url(#topCoreGlow)" />
              <circle cx="24" cy="24" r="18" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.8" />
              <circle cx="24" cy="24" r="14" fill="none" stroke="#22d3ee" strokeWidth="1" strokeDasharray="6 4" />
              <polygon
                points="24,35 13,17 35,17"
                fill="none"
                stroke="#67e8f9"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <polygon points="24,29 19,20 29,20" fill="#22d3ee" />
            </svg>
          </div>
          <div className="hidden sm:block leading-tight">
            <div className="font-display text-lg font-bold tracking-[0.2em] text-slate-50 group-hover:text-cyan-200 transition-colors">
              F.R.I.D.A.Y.
            </div>
            <div className="text-[10px] text-cyan-300/80 tracking-wide">
              Fully Responsive Intelligent Digital Assistant for You
            </div>
          </div>
        </button>

        {/* Top Mode Tabs */}
        <nav aria-label="Workspace Mode Tabs" className="hidden lg:flex items-center gap-1.5 ml-2">
          {TOP_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectSection(tab.id)}
                className={`flex flex-col items-center justify-center px-3.5 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'hud-panel-active text-cyan-100'
                    : 'text-slate-300 hover:text-cyan-200 hover:bg-slate-900/60 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 mb-0.5 ${isActive ? 'text-cyan-300' : 'text-slate-300'}`} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Center: Live Digital Clock Notch */}
      <div className="hidden md:flex flex-col items-center justify-center px-5 py-1 rounded-xl border border-cyan-500/25 bg-[#061126]/85 shrink-0">
        <div className="font-display text-xl sm:text-2xl font-bold tracking-wider text-slate-50 tabular-nums leading-none">
          {formattedTime}
        </div>
        <div className="text-[11px] text-cyan-300/85 font-medium mt-0.5 tabular-nums">
          {formattedDate}
        </div>
      </div>

      {/* Right: Telemetry Pills, Profile & Window Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Hardware Quick Strip */}
        <div className="hidden xl:flex items-center gap-2.5 px-3 py-1.5 rounded-lg hud-panel text-xs">
          <span
            title={
              telemetry
                ? `Network ↓ ${telemetry.networkRxKbps} / ↑ ${telemetry.networkTxKbps} KB/s`
                : 'Network Active'
            }
            className="text-cyan-300 flex items-center"
          >
            <Wifi className="w-4 h-4" aria-hidden="true" />
          </span>

          <button
            type="button"
            onClick={isSpeaking ? onStopSpeaking : onToggleAutoSpeak}
            aria-label={isSpeaking ? 'Stop speaking' : 'Toggle auto-voice replies'}
            title={isSpeaking ? 'Click to stop speaking' : `Auto-voice: ${autoSpeakReplies ? 'On' : 'Off'}`}
            className={`transition-colors ${
              isSpeaking || autoSpeakReplies ? 'text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {autoSpeakReplies || isSpeaking ? (
              <Volume2 className="w-4 h-4" aria-hidden="true" />
            ) : (
              <VolumeX className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <span className="inline-flex items-center gap-1 font-mono-tabular text-slate-100 text-xs">
            <Battery className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>{telemetry?.batteryPercent !== null && telemetry?.batteryPercent !== undefined ? `${batteryPct}%` : 'AC'}</span>
          </span>
        </div>

        {/* User Profile Pill */}
        <button
          type="button"
          onClick={() => onSelectSection('settings')}
          className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg hud-panel hover:border-cyan-400/50 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 flex items-center justify-center text-slate-950 font-bold text-xs shrink-0">
            {(userName || 'V').slice(0, 1).toUpperCase()}
          </div>
          <div className="text-left leading-tight">
            <div className="text-xs font-semibold text-slate-100 truncate max-w-[110px]">
              {userName || 'Vishvajit'}
            </div>
            <div className="text-[10px] text-cyan-300/80">Admin</div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        </button>

        {/* Window Controls */}
        <div className="flex items-center rounded-lg hud-panel overflow-hidden">
          <button
            type="button"
            onClick={onHideToDesktop}
            aria-label="Minimize to desktop"
            title="Hide to Desktop (ESC)"
            className="p-2 text-slate-300 hover:text-cyan-200 hover:bg-slate-800/70 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            title="Toggle Fullscreen"
            className="p-2 text-slate-300 hover:text-cyan-200 hover:bg-slate-800/70 transition-colors border-x border-cyan-500/20"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onHideToDesktop}
            aria-label="Hide workspace"
            title="Hide Workspace (ESC)"
            className="p-2 text-slate-300 hover:text-rose-300 hover:bg-rose-500/15 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
