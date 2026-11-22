import {
  Activity,
  Box,
  Calendar,
  CheckSquare,
  Folder,
  Globe,
  Home,
  LayoutGrid,
  MessageSquareMore,
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
  { id: 'ai-chat', label: 'AI Chat', icon: MessageSquareMore },
  { id: 'voice-assistant', label: 'Voice Assistant', icon: Mic },
  { id: 'applications', label: 'Applications', icon: LayoutGrid },
  { id: 'file-explorer', label: 'File Explorer', icon: Folder },
  { id: 'browser-intelligence', label: 'Browser', icon: Globe },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'tasks-workflows', label: 'Tasks & Notes', icon: CheckSquare },
  { id: 'system-monitor', label: 'System Monitor', icon: Activity },
  { id: 'memory', label: 'Memory & History', icon: Box },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function LeftSidebar({
  activeSection,
  onSelectSection,
  voiceState,
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
      className="w-[206px] shrink-0 h-full py-2.5 pl-3 pr-1 flex flex-col"
    >
      <div className="hud-sidebar-panel rounded-2xl h-full flex flex-col overflow-hidden">
        {/* 11 Navigation Modules matching reference order and icons */}
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
                className={`relative w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-[13px] font-medium transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-fuchsia-400 ${
                  active
                    ? 'hud-sidebar-item-active text-white'
                    : 'text-purple-100/80 hover:bg-purple-900/35 hover:text-white border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-fuchsia-200 drop-shadow-[0_0_6px_rgba(232,121,249,0.85)]' : 'text-purple-200/80'
                  }`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {isBusy && (
          <div className="p-2 border-t border-purple-500/25">
            <button
              type="button"
              onClick={onStopExecution}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-500/40 hover:bg-rose-500/30 transition-colors whitespace-nowrap shrink-0"
            >
              <Square className="w-3 h-3" aria-hidden="true" />
              <span>Stop Execution</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
