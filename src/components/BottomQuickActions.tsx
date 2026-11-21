import {
  Activity,
  FilePlus,
  FileText,
  FolderOpen,
  Globe,
  Search,
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
      icon: FolderOpen,
      onClick: () => onSelectSection('applications'),
    },
    {
      id: 'search-file',
      title: 'Search File',
      subtitle: '(e.g. Find my report)',
      icon: Search,
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
      icon: FilePlus,
      onClick: () => onSelectSection('calendar'),
    },
    {
      id: 'system',
      title: 'System',
      subtitle: '(Performance / Clean)',
      icon: Activity,
      onClick: () => onRunQuickCommand('Check laptop performance'),
    },
  ];

  return (
    <footer
      aria-label="Quick Actions Bar"
      className="relative z-20 shrink-0 px-3 sm:px-4 py-2 border-t border-cyan-500/20 bg-[#040a18]/88"
    >
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => onSelectSection('tasks-workflows')}
          className="hud-panel-active px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold text-cyan-100 whitespace-nowrap shrink-0 hover:brightness-110 transition-all"
        >
          <Zap className="w-4 h-4 text-cyan-300" aria-hidden="true" />
          <span>Quick Actions</span>
        </button>

        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.id}
              type="button"
              onClick={act.onClick}
              className="flex-1 min-w-[148px] hud-panel px-3 py-1.5 rounded-xl flex items-center gap-2.5 text-left hover:border-cyan-400/60 hover:bg-cyan-500/10 transition-all shrink-0"
            >
              <Icon className="w-4 h-4 text-cyan-300 shrink-0" aria-hidden="true" />
              <div className="min-w-0 leading-tight">
                <div className="text-xs font-semibold text-slate-100 truncate">{act.title}</div>
                <div className="text-[10px] text-slate-400 truncate">{act.subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>
    </footer>
  );
}
