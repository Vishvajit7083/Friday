import { useEffect, useState } from 'react';
import {
  Atom,
  BatteryCharging,
  Bot,
  ChevronDown,
  Home,
  Menu,
  Minus,
  Plug,
  Square,
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
  { id: 'ai-core', label: 'AI Core', icon: Atom },
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
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const timeParts = now
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .split(' ');
  const timeDigits = timeParts[0] || '12:00';
  const timeMeridiem = timeParts[1] || 'AM';
  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const hasBattery = telemetry?.batteryPercent !== null && telemetry?.batteryPercent !== undefined;
  const batteryLabel = hasBattery ? `${telemetry.batteryPercent}%` : telemetry ? 'AC' : '--';

  return (
    <header className="relative z-20 shrink-0 px-3 sm:px-4 pt-2 pb-2 flex items-center justify-between gap-2 bg-gradient-to-b from-[#0b031a]/95 via-[#090315]/88 to-[#06020e]/75 border-b border-purple-500/40 shadow-[0_4px_24px_rgba(147,51,234,0.22)]">
      {/* Left: Brand Emblem + Mobile Toggle + 4 HUD Tabs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Toggle navigation menu"
          className="md:hidden p-2 rounded-lg hud-panel text-purple-300"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* F.R.I.D.A.Y. Neon Purple Arc Emblem & Wordmark */}
        <button
          type="button"
          onClick={() => onSelectSection('command-center')}
          className="flex items-center gap-2.5 text-left shrink-0 group"
        >
          <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 56 56" className="w-11 h-11 drop-shadow-[0_0_12px_rgba(217,70,239,0.85)]" aria-hidden="true">
              <defs>
                <radialGradient id="topCorePurpleGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f5d0fe" stopOpacity="1" />
                  <stop offset="45%" stopColor="#d946ef" stopOpacity="0.65" />
                  <stop offset="100%" stopColor="#581c87" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="28" cy="28" r="25" fill="url(#topCorePurpleGlow)" />
              <circle cx="28" cy="28" r="20" fill="#0d041c" fillOpacity="0.85" stroke="#c084fc" strokeWidth="1.8" />
              <circle cx="28" cy="28" r="16" fill="none" stroke="#e879f9" strokeWidth="1.2" strokeDasharray="8 4" />
              <polygon
                points="28,41 15,19 41,19"
                fill="none"
                stroke="#f5d0fe"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
              <polygon points="28,34 21,22 35,22" fill="#f0abfc" />
            </svg>
          </div>
          <div className="hidden sm:block leading-[1.15]">
            <div className="font-display text-[21px] font-bold tracking-[0.14em] text-white drop-shadow-[0_0_10px_rgba(216,180,254,0.4)]">
              F.R.I.D.A.Y.
            </div>
            <div className="text-[9.5px] text-purple-200/80 tracking-wide max-w-[165px] leading-tight">
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
                className={`flex flex-col items-center justify-center px-3.5 py-1.5 rounded-xl text-[11px] font-medium transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'hud-panel-active text-white'
                    : 'text-purple-100/85 hover:text-white hover:bg-purple-950/50 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 mb-0.5 ${isActive ? 'text-fuchsia-200 drop-shadow-[0_0_6px_rgba(232,121,249,0.9)]' : 'text-purple-200/80'}`}
                  aria-hidden="true"
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Center: Contoured Digital Clock Notch */}
      <div className="hidden md:flex flex-col items-center justify-center px-7 py-1 rounded-b-2xl rounded-t-lg border border-purple-500/55 bg-gradient-to-b from-[#160730]/92 to-[#090216]/95 shadow-[0_0_24px_rgba(168,85,247,0.34),inset_0_0_14px_rgba(168,85,247,0.18)] shrink-0">
        <div className="flex items-baseline gap-1 font-display text-white tabular-nums leading-none">
          <span className="text-[22px] font-bold tracking-wider">{timeDigits}</span>
          <span className="text-xs font-semibold text-purple-100">{timeMeridiem}</span>
        </div>
        <div className="text-[11px] text-purple-200/85 font-medium mt-0.5 tabular-nums">
          {dateLabel}
        </div>
      </div>

      {/* Right: Telemetry Pill, User Profile & Window Controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Combined Status + Profile HUD Capsule matching reference */}
        <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl hud-panel">
          <div className="hidden xl:flex items-center gap-3 pr-2 border-r border-purple-500/30">
            <span
              title={
                telemetry
                  ? `Network ↓ ${telemetry.networkRxKbps} / ↑ ${telemetry.networkTxKbps} KB/s`
                  : 'Wi-Fi Connected'
              }
              className="text-fuchsia-400 flex items-center drop-shadow-[0_0_6px_rgba(217,70,239,0.75)]"
            >
              <Wifi className="w-4 h-4" aria-hidden="true" />
            </span>

            <button
              type="button"
              onClick={isSpeaking ? onStopSpeaking : onToggleAutoSpeak}
              aria-label={isSpeaking ? 'Stop speaking' : 'Toggle auto-voice replies'}
              title={isSpeaking ? 'Click to stop speaking' : `Auto-voice: ${autoSpeakReplies ? 'On' : 'Off'}`}
              className="text-purple-100 hover:text-fuchsia-300 transition-colors"
            >
              {isSpeaking || autoSpeakReplies ? (
                <Volume2 className="w-4 h-4" aria-hidden="true" />
              ) : (
                <VolumeX className="w-4 h-4 opacity-70" aria-hidden="true" />
              )}
            </button>

            <span
              className="inline-flex items-center gap-1.5 font-mono-tabular text-white text-xs font-medium"
              title={hasBattery ? `Battery ${batteryLabel}` : 'External AC / Host Power'}
            >
              {hasBattery ? (
                <BatteryCharging className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.7)]" aria-hidden="true" />
              ) : (
                <Plug className="w-3.5 h-3.5 text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.7)]" aria-hidden="true" />
              )}
              <span>{batteryLabel}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => onSelectSection('settings')}
            className="flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            {/* Stylized Circular User Portrait Avatar */}
            <div className="w-7 h-7 rounded-full border border-fuchsia-400/75 bg-gradient-to-b from-purple-900 to-[#0d051a] overflow-hidden flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(192,132,252,0.45)]">
              <svg viewBox="0 0 32 32" className="w-7 h-7" aria-hidden="true">
                <circle cx="16" cy="16" r="16" fill="#1e0b38" />
                <circle cx="16" cy="12" r="5" fill="#e9d5ff" />
                <path d="M7,28 C7,21 25,21 25,28" fill="#a855f7" />
                <path d="M11,10 C11,6 21,6 21,10" fill="#1e1b4b" />
              </svg>
            </div>
            <div className="text-left leading-tight">
              <div className="text-xs font-semibold text-white truncate max-w-[120px]">
                {userName || 'Siddesh'}
              </div>
              <div className="text-[10px] text-purple-200/75">Admin</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-purple-200/80" aria-hidden="true" />
          </button>
        </div>

        {/* Window Controls */}
        <div className="flex items-center rounded-xl hud-panel overflow-hidden">
          <button
            type="button"
            onClick={onHideToDesktop}
            aria-label="Minimize to desktop"
            title="Hide to Desktop (ESC)"
            className="p-2 text-purple-100/85 hover:text-white hover:bg-purple-800/40 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            title="Toggle Fullscreen"
            className="p-2 text-purple-100/85 hover:text-white hover:bg-purple-800/40 transition-colors border-x border-purple-500/25"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onHideToDesktop}
            aria-label="Hide workspace"
            title="Hide Workspace (ESC)"
            className="p-2 text-purple-100/85 hover:text-fuchsia-200 hover:bg-fuchsia-600/25 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
