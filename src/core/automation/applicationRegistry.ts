import type { ApplicationProfile } from './types';

export const APPLICATION_CATALOG: ApplicationProfile[] = [
  {
    id: 'chrome',
    name: 'Google Chrome',
    category: 'browser',
    exeNames: ['chrome.exe', 'google-chrome', 'chromium'],
    aliases: ['chrome', 'google chrome', 'browser'],
    fallbackIds: ['edge'],
    capabilities: ['open_url', 'search_web', 'youtube', 'tabs', 'inspect_dom'],
  },
  {
    id: 'edge',
    name: 'Microsoft Edge',
    category: 'browser',
    exeNames: ['msedge.exe'],
    aliases: ['edge', 'microsoft edge', 'msedge'],
    fallbackIds: ['chrome'],
    capabilities: ['open_url', 'search_web', 'youtube', 'tabs'],
  },
  {
    id: 'code',
    name: 'Visual Studio Code',
    category: 'development',
    exeNames: ['Code.exe', 'code.cmd', 'code'],
    aliases: ['vscode', 'vs code', 'visual studio code', 'code'],
    fallbackIds: ['notepad++', 'notepad'],
    capabilities: ['open_folder', 'open_file', 'integrated_terminal', 'debug'],
  },
  {
    id: 'devenv',
    name: 'Visual Studio',
    category: 'development',
    exeNames: ['devenv.exe'],
    aliases: ['visual studio', 'devenv'],
    fallbackIds: ['code'],
    capabilities: ['open_solution', 'build_cpp'],
  },
  {
    id: 'notepad++',
    name: 'Notepad++',
    category: 'development',
    exeNames: ['notepad++.exe'],
    aliases: ['notepad++', 'notepad plus plus', 'npp'],
    fallbackIds: ['notepad', 'code'],
    capabilities: ['open_file', 'edit_code'],
  },
  {
    id: 'notepad',
    name: 'Notepad',
    category: 'productivity' as unknown as ApplicationProfile['category'],
    exeNames: ['notepad.exe'],
    aliases: ['notepad', 'text editor'],
    fallbackIds: ['code'],
    capabilities: ['open_file', 'write_text'],
  },
  {
    id: 'winword',
    name: 'Microsoft Word',
    category: 'office',
    exeNames: ['WINWORD.EXE'],
    aliases: ['word', 'ms word', 'microsoft word', 'winword', 'docx'],
    supportsCom: true,
    fallbackIds: ['notepad'],
    capabilities: ['create_docx', 'write_headings', 'write_paragraphs', 'insert_tables'],
  },
  {
    id: 'excel',
    name: 'Microsoft Excel',
    category: 'office',
    exeNames: ['EXCEL.EXE'],
    aliases: ['excel', 'ms excel', 'microsoft excel', 'spreadsheet', 'xlsx'],
    supportsCom: true,
    fallbackIds: [],
    capabilities: ['create_xlsx', 'formulas', 'sheets', 'tables', 'summary'],
  },
  {
    id: 'powerpnt',
    name: 'Microsoft PowerPoint',
    category: 'office',
    exeNames: ['POWERPNT.EXE'],
    aliases: ['powerpoint', 'ms powerpoint', 'microsoft powerpoint', 'ppt', 'pptx', 'slides'],
    supportsCom: true,
    fallbackIds: [],
    capabilities: ['create_pptx', 'add_slides', 'slide_layouts'],
  },
  {
    id: 'explorer',
    name: 'File Explorer',
    category: 'system',
    exeNames: ['explorer.exe'],
    aliases: ['explorer', 'file explorer', 'files'],
    fallbackIds: [],
    capabilities: ['open_folder', 'select_file'],
  },
  {
    id: 'wt',
    name: 'Windows Terminal',
    category: 'system',
    exeNames: ['wt.exe'],
    aliases: ['terminal', 'windows terminal', 'wt'],
    fallbackIds: ['powershell', 'cmd'],
    capabilities: ['run_command'],
  },
  {
    id: 'powershell',
    name: 'Windows PowerShell',
    category: 'system',
    exeNames: ['pwsh.exe', 'powershell.exe'],
    aliases: ['powershell', 'pwsh'],
    fallbackIds: ['cmd'],
    capabilities: ['run_command', 'uia_automation', 'com_automation'],
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    category: 'system',
    exeNames: ['cmd.exe'],
    aliases: ['cmd', 'command prompt'],
    fallbackIds: ['powershell'],
    capabilities: ['run_command'],
  },
  {
    id: 'calculator',
    name: 'Calculator',
    category: 'system',
    exeNames: ['calc.exe'],
    aliases: ['calculator', 'calc'],
    fallbackIds: [],
    capabilities: ['launch'],
  },
  {
    id: 'settings',
    name: 'Windows Settings',
    category: 'system',
    exeNames: [],
    aliases: ['settings', 'windows settings'],
    fallbackIds: [],
    capabilities: ['deep_link'],
  },
  {
    id: 'paint',
    name: 'Paint',
    category: 'media',
    exeNames: ['mspaint.exe'],
    aliases: ['paint', 'mspaint'],
    fallbackIds: [],
    capabilities: ['launch'],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'media',
    exeNames: ['Spotify.exe'],
    aliases: ['spotify'],
    fallbackIds: ['chrome'],
    capabilities: ['launch', 'media_keys'],
  },
  {
    id: 'vlc',
    name: 'VLC Media Player',
    category: 'media',
    exeNames: ['vlc.exe'],
    aliases: ['vlc', 'media player'],
    fallbackIds: [],
    capabilities: ['play_media', 'media_keys'],
  },
  {
    id: 'discord',
    name: 'Discord',
    category: 'communication',
    exeNames: ['Discord.exe'],
    aliases: ['discord'],
    fallbackIds: ['chrome'],
    capabilities: ['launch'],
  },
];

export class ApplicationManager {
  private profiles: ApplicationProfile[];

  constructor(customProfiles: ApplicationProfile[] = []) {
    this.profiles = [...APPLICATION_CATALOG, ...customProfiles];
  }

  getAllProfiles(): ApplicationProfile[] {
    return this.profiles;
  }

  resolveProfile(query: string): ApplicationProfile | null {
    const clean = query.trim().toLowerCase();
    if (!clean) return null;
    const exactId = this.profiles.find((p) => p.id.toLowerCase() === clean);
    if (exactId) return exactId;

    const aliasHit = this.profiles.find((p) =>
      p.aliases.some((alias) => clean === alias || new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(clean))
    );
    if (aliasHit) return aliasHit;

    return (
      this.profiles.find((p) => p.name.toLowerCase().includes(clean)) ||
      null
    );
  }

  getFallbackChain(appId: string): ApplicationProfile[] {
    const primary = this.resolveProfile(appId);
    if (!primary) return [];
    const chain: ApplicationProfile[] = [primary];
    for (const fbId of primary.fallbackIds) {
      const fb = this.resolveProfile(fbId);
      if (fb && !chain.some((c) => c.id === fb.id)) {
        chain.push(fb);
      }
    }
    return chain;
  }
}
