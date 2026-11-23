import {
  Activity,
  Bot,
  Calendar,
  CheckSquare,
  EyeOff,
  FolderSearch,
  Globe,
  Home,
  Layers,
  MessageSquare,
  Mic,
  Settings,
  Square,
} from 'lucide-react';
import type { NavSection, VoiceState } from '../core/types';

interface LeftSidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  voiceState: VoiceState;
  onHideToDesktop: () => void;
  onStopExecution: () => void;
}

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: typeof Home }> = [
  { id: 'command-center', label: 'Dashboard', icon: Home },
  { id: 'ai-chat', label: 'AI Chat', icon: MessageSquare },
  { id: 'voice-assistant', label: 'Voice Assistant', icon: Mic },
  { id: 'applications', label: 'Applications', icon: Layers },
  { id: 'file-explorer', label: 'File Explorer', icon: FolderSearch },
  { id: 'browser-intelligence', label: 'Browser', icon: Globe },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'tasks-workflows', label: 'Tasks & Notes', icon: CheckSquare },
  { id: 'system-monitor', label: 'System Monitor', icon: Activity },
  { id: 'memory', label: 'Memory & History', icon: Bot },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function LeftSidebar({
  activeSection,
  onSelectSection,
  voiceState,
  onHideToDesktop,
  onStopExecution,
}: LeftSidebarProps) {
  const isBusy =
    voiceState === 'processing' ||
    voiceState === 'searching' ||
    voiceState === 'executing' ||
    voiceState === 'speaking' ||
    voiceState === 'listening';

  return (
    <aside
      aria-label="Primary Navigation"
      className="w-[208px] shrink-0 h-full py-2.5 pl-3 pr-1 flex flex-col"
    >
      <div className="hud-panel rounded-2xl h-full flex flex-col overflow-hidden">
        {/* 11 Navigation Modules */}
        <nav className="flex-1 overflow-y-auto px-2 py-2.5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              activeSection === item.id ||
              (item.id === 'memory' && activeSection === 'chat-history');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  active
                    ? 'hud-panel-active text-cyan-100'
                    : 'text-slate-300 hover:bg-slate-800/55 hover:text-cyan-100 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-300' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Desktop Control & Safety Stop */}
        <div className="p-2 border-t border-cyan-500/20 space-y-1.5">
          {isBusy && (
            <button
              type="button"
              onClick={onStopExecution}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-500/40 hover:bg-rose-500/30 transition-colors whitespace-nowrap shrink-0"
            >
              <Square className="w-3 h-3" aria-hidden="true" />
              <span>Stop Execution</span>
            </button>
          )}

          <button
            type="button"
            onClick={onHideToDesktop}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-900/80 text-slate-300 border border-cyan-500/20 hover:border-cyan-400/50 hover:text-cyan-100 transition-colors whitespace-nowrap shrink-0"
          >
            <span className="flex items-center gap-1.5">
              <EyeOff className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>Hide</span>
            </span>
            <span className="font-mono-tabular text-[10px] text-slate-400">ESC</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
