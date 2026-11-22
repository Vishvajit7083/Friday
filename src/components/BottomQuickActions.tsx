import {
  FileText,
  Folder,
  FolderInput,
  FolderSearch,
  Globe,
  Monitor,
  Zap,
} from 'lucide-react';
import type { NavSection } from '../core/types';

interface BottomQuickActionsProps {
  onSelectSection: (section: NavSection) => void;
  onRunQuickCommand: (command: string) => void;
}

export function BottomQuickActions({
  onSelectSection,
  onRunQuickCommand,
}: BottomQuickActionsProps) {
  const actions = [
    {
      id: 'open-app',
      title: 'Open App',
      subtitle: '(e.g. Open Chrome)',
      icon: FolderInput,
      onClick: () => onSelectSection('applications'),
    },
    {
      id: 'search-file',
      title: 'Search File',
      subtitle: '(e.g. Find my report)',
      icon: FolderSearch,
      onClick: () => onSelectSection('file-explorer'),
    },
    {
      id: 'web-search',
      title: 'Web Search',
      subtitle: '(e.g. Latest AI news)',
      icon: Globe,
      onClick: () => onSelectSection('browser-intelligence'),
    },
    {
      id: 'analyze',
      title: 'Analyze',
      subtitle: '(Image / Video / Doc)',
      icon: FileText,
      onClick: () => onSelectSection('file-explorer'),
    },
    {
      id: 'create',
      title: 'Create',
      subtitle: '(Folder / File / Note)',
      icon: Folder,
      onClick: () => onSelectSection('calendar'),
    },
    {
      id: 'system',
      title: 'System',
      subtitle: '(Performance / Clean)',
      icon: Monitor,
      onClick: () => onRunQuickCommand('Check laptop performance'),
    },
  ];

  return (
    <footer
      aria-label="Quick Actions Bar"
      className="relative z-20 shrink-0 px-3 sm:px-4 pt-1 pb-2.5 bg-transparent"
    >
      <div className="flex items-center gap-2.5 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => onSelectSection('tasks-workflows')}
          className="hud-quick-card-active px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:brightness-110 transition-all"
        >
          <Zap className="w-4 h-4 text-fuchsia-200 drop-shadow-[0_0_8px_rgba(232,121,249,0.95)]" aria-hidden="true" />
          <span>Quick Actions</span>
        </button>

        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.id}
              type="button"
              onClick={act.onClick}
              className="flex-1 min-w-[148px] hud-quick-card px-3.5 py-2 rounded-xl flex items-center gap-2.5 text-left hover:border-fuchsia-400/75 hover:bg-purple-950/55 transition-all shrink-0"
            >
              <Icon className="w-4 h-4 text-purple-200 shrink-0" aria-hidden="true" />
              <div className="min-w-0 leading-tight">
                <div className="text-xs font-semibold text-white truncate">{act.title}</div>
                <div className="text-[10px] text-purple-200/70 truncate">{act.subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>
    </footer>
  );
}
