import path from 'path';
import {
  applyLexiconCanonicalization,
  detectCognitiveLanguage,
  normalizeUnicodeAndDevanagari,
} from '../cognitive/hinglishNlp';
import {
  classifyTerminalCommandRisk,
  PermissionManager,
  SafetyManager,
} from './permissionAndSafety';
import type {
  WorkflowPlanSpec,
  WorkflowPreferenceItem,
  WorkflowRiskLevel,
  WorkflowStepSpec,
} from './types';

export interface PlannerContext {
  allowedFolders: string[];
  approvedExternalPaths?: string[];
  preferences: WorkflowPreferenceItem[];
  confirmedAction?: boolean;
}

function getPrefValue(preferences: WorkflowPreferenceItem[], key: string): string | undefined {
  return preferences.find((p) => p.key === key)?.value;
}

function extractExplicitPath(text: string): string | undefined {
  const winDrive = text.match(/([a-zA-Z]:\\[^\n\r"'<>|]+?)(?=\s+(?:and|aur|then|mein|me|ke|and|with|to|open|create|make|banao)\b|[,.!?]|$)/i);
  if (winDrive?.[1]) return winDrive[1].trim().replace(/[\\/]+$/, '');
  const posixPath = text.match(/(?:^|\s)(\/(?:tmp|home|app|var|Users)[^\s"'<>|]+)/);
  if (posixPath?.[1]) return posixPath[1].trim();
  return undefined;
}

function extractTopic(raw: string, stripPatterns: RegExp[], fallback: string): string {
  let clean = raw.trim();
  for (const rx of stripPatterns) {
    clean = clean.replace(rx, ' ');
  }
  clean = clean.replace(/\s+/g, ' ').replace(/^[\s:,-]+|[\s:,-]+$/g, '').trim();
  return clean || fallback;
}

function makeStep(partial: Omit<WorkflowStepSpec, 'dependsOn' | 'risk' | 'requiresConfirmation'> & {
  dependsOn?: string[];
  risk?: WorkflowRiskLevel;
  requiresConfirmation?: boolean;
}): WorkflowStepSpec {
  return {
    dependsOn: [],
    risk: 'low',
    requiresConfirmation: false,
    ...partial,
  };
}

function extractFolderCreationSpec(rawGoal: string): {
  matched: boolean;
  driveLetter?: string;
  folderName: string;
  explicitPath?: string;
} {
  const trimmed = rawGoal.trim();
  const hasCreateFolder =
    /\b(create|make|banao|bana(?:\s+de|\s+do)?)\b.*\b(folder|directory)\b/i.test(trimmed) ||
    /\b(folder|directory)\b.*\b(create|make|banao|bana(?:\s+de|\s+do)?)\b/i.test(trimmed);
  if (!hasCreateFolder) return { matched: false, folderName: 'FridayFolder' };

  // Avoid stealing VS Code / website creation requests
  if (/\b(vs\s*code|vscode|website|login\s*page|web\s*project|landing\s*page)\b/i.test(trimmed)) {
    return { matched: false, folderName: 'FridayFolder' };
  }

  const explicit = extractExplicitPath(trimmed);
  const driveMatch = trimmed.match(/\b(?:on|in|mein|me|pe)?\s*([a-zA-Z])\s*drive\b/i);
  const withoutDrivePhrase = trimmed
    .replace(/\b(?:on|in|mein|me|pe)?\s*[a-zA-Z]\s*drive\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const namedMatch =
    withoutDrivePhrase.match(/\b(?:named|called|name)\s+["']?([a-zA-Z0-9 _.-]{2,40})["']?/i) ||
    withoutDrivePhrase.match(/\b(?:folder|directory)\s+(?:named\s+|called\s+)?["']?([a-zA-Z0-9 _.-]{2,40})["']?$/i) ||
    withoutDrivePhrase.match(/\b(?:create|make)\s+(?:a\s+|an\s+|new\s+)?([a-zA-Z0-9_.-]{2,40})\s+(?:folder|directory)\b/i);

  const rawName = namedMatch?.[1]?.trim();
  const invalidName =
    !rawName ||
    /^(?:on|in|mein|me|pe|drive|new|a|an|ek|banao|bana|de|do|create|make|folder|directory|on\s+drive)$/i.test(rawName);
  const folderName = invalidName ? 'FridayFolder' : rawName.replace(/[\\/:*?"<>|]/g, '').trim() || 'FridayFolder';

  return {
    matched: true,
    driveLetter: driveMatch?.[1]?.toUpperCase(),
    folderName,
    explicitPath: explicit,
  };
}

export class WorkflowPlanner {
  static isWorkflowControlCommand(raw: string): 'pause' | 'resume' | 'cancel' | 'status' | null {
    const lower = raw.trim().toLowerCase();
    if (/\b(pause|rok\s*do|hold)\b.*\b(task|workflow|job|kaam|automation)\b|\b(pause\s+current\s+task)\b/i.test(lower)) {
      return 'pause';
    }
    if (/\b(resume|continue|chalu\s*karo|wapas\s*shuru)\b.*\b(task|workflow|job|kaam|automation)\b/i.test(lower)) {
      return 'resume';
    }
    if (/\b(cancel|stop|abort|band\s*karo)\b.*\b(task|workflow|job|automation)\b/i.test(lower)) {
      return 'cancel';
    }
    if (/\b(task\s+status|workflow\s+status|background\s+tasks?|kya\s+chal\s+raha)\b/i.test(lower)) {
      return 'status';
    }
    return null;
  }

  static isAutomationGoal(raw: string): boolean {
    const lower = raw.trim().toLowerCase();
    if (!lower) return false;
    if (this.isWorkflowControlCommand(raw)) return true;

    const isLocalMediaHint = /\b(local|downloaded|offline|my\s+(?:music|songs?|playlist|folder))\b/i.test(lower);
    const hasBrowserHint = /\b(chrome|edge|brave|browser)\b/i.test(lower);
    const hasYouTubePlay =
      (/\b(youtube|yt)\b/i.test(lower) &&
        /\b(play|search|open|bajao|chala|lofi|music|song|songs|video|gana|gaana|sunao|next|pause|resume|volume|mute|fullscreen)\b/i.test(lower)) ||
      (hasBrowserHint &&
        !isLocalMediaHint &&
        /\b(play|search|bajao|chala|sunao)\b/i.test(lower) &&
        /\b(music|song|songs|video|track|lofi|gana|gaana)\b/i.test(lower));
    const hasWordDoc =
      /\b(word|docx|document|report)\b/i.test(lower) &&
      /\b(create|make|write|generate|save|research|banao|likho)\b/i.test(lower);
    const hasExcel = /\b(excel|xlsx|spreadsheet|expense\s*sheet|monthly\s*expenses)\b/i.test(lower);
    const hasPpt =
      /\b(powerpoint|pptx|ppt|presentation|slides?)\b/i.test(lower) &&
      /\b(create|make|generate|open|deck|topic|banao)\b/i.test(lower);
    const hasWebOrVsCode =
      /\b(login\s*page|website|web\s*project|landing\s*page|html\s*css|html\s+and\s+css)\b/i.test(lower) ||
      (/\b(vs\s*code|vscode)\b/i.test(lower) && /\b(create|make|open|folder|project|code|run|test|fix|banao)\b/i.test(lower));
    const hasNotepadCode =
      /\b(notepad|c\s+program|cpp|python\s+script)\b/i.test(lower) &&
      /\b(write|create|hello\s*world|program|code|save|likho|banao)\b/i.test(lower);
    const hasFileOps =
      (/\b(organize|sort|clean\s*up)\b/i.test(lower) && /\b(files?|downloads?|desktop|documents?|folder)\b/i.test(lower)) ||
      (/\b(copy|move|rename|delete|remove|erase)\b/i.test(lower) && /\b(file|folder|directory)\b/i.test(lower));
    const hasTerminal =
      /\b(run\s+(?:terminal|command|cmd|powershell)|execute\s+command)\b/i.test(lower) ||
      /^(?:npm\s+test|git\s+status)\b/i.test(lower);
    const hasScreenOcr = /\b(read\s+screen|ocr\s+screen|what\s+is\s+on\s+(?:my\s+)?screen|screen\s+text)\b/i.test(lower);
    const hasPrefSave = /\b(save|remember|set)\b.*\b(preferred|default)\b.*\bfolder\b/i.test(lower);
    const hasMediaCtrl =
      /\b(pause|next|previous|skip|volume|mute|fullscreen)\b/i.test(lower) &&
      /\b(youtube|music|song|video|media|track|awaz)\b/i.test(lower);
    const hasDriveAction =
      (/(?:[a-zA-Z]:\\[^\s"'<>|]+)/.test(lower) && /\b(create|make|folder|file|website|project|banao)\b/i.test(lower)) ||
      extractFolderCreationSpec(raw).matched;

    return (
      hasYouTubePlay ||
      hasWordDoc ||
      hasExcel ||
      hasPpt ||
      hasWebOrVsCode ||
      hasNotepadCode ||
      hasFileOps ||
      hasTerminal ||
      hasScreenOcr ||
      hasPrefSave ||
      hasMediaCtrl ||
      hasDriveAction
    );
  }

  static planGoal(rawGoal: string, ctx: PlannerContext): WorkflowPlanSpec {
    const unicodeNorm = normalizeUnicodeAndDevanagari(rawGoal);
    const langInfo = detectCognitiveLanguage(unicodeNorm);
    const { canonicalTokens } = applyLexiconCanonicalization(unicodeNorm);
    const normText = canonicalTokens.join(' ') || unicodeNorm.toLowerCase();
    const detectedLang: 'english' | 'hinglish' | 'hindi' =
      langInfo.language === 'hindi'
        ? 'hindi'
        : langInfo.language === 'hinglish' || langInfo.language === 'mixed'
          ? 'hinglish'
          : 'english';
    const lower = `${rawGoal} ${unicodeNorm} ${normText}`.toLowerCase();
    const nowIso = new Date().toISOString();
    const planId = `wfplan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const safety = SafetyManager.checkGoalPolicy(rawGoal);
    if (!safety.allowed) {
      return {
        id: planId,
        goal: rawGoal,
        normalizedGoal: normText,
        scenarioKey: 'safety_blocked',
        language: detectedLang,
        riskLevel: 'high',
        requiresConfirmation: false,
        confirmationReason: safety.reason,
        usesPreferences: [],
        steps: [],
        createdAt: nowIso,
      };
    }

    const defaultWorkspace = ctx.allowedFolders[0] || process.cwd();
    const preferredWebFolder = getPrefValue(ctx.preferences, 'preferred_web_folder');
    const preferredBrowser = getPrefValue(ctx.preferences, 'preferred_browser') || (/\bedge\b/i.test(lower) ? 'edge' : 'chrome');
    const preferredEditor = getPrefValue(ctx.preferences, 'preferred_editor') || 'code';
    const explicitPath = extractExplicitPath(rawGoal);
    const usesPreferences: string[] = [];

    const steps: WorkflowStepSpec[] = [];
    let scenarioKey = 'general_automation';
    let riskLevel: WorkflowRiskLevel = 'low';
    let requiresConfirmation = false;
    let confirmationReason: string | undefined;
    let targetPath: string | undefined = explicitPath;

    // Preference saving intent
    const prefFolderMatch = rawGoal.match(/(?:preferred|default|mera)\s+(?:website|web|project|projects)\s+folder\s+(?:is|=|as|set\s+to)?\s*([a-zA-Z]:\\[^\n\r"'<>|]+|\/[^\s"'<>|]+)/i);
    if (prefFolderMatch?.[1] || /\b(save|remember|set)\b.*\b(preferred|default)\b.*\bfolder\b/i.test(lower)) {
      const folderVal = (prefFolderMatch?.[1] || explicitPath || defaultWorkspace).trim();
      scenarioKey = 'save_workflow_preference';
      targetPath = folderVal;
      steps.push(
        makeStep({
          id: 'step-1',
          title: `Save preferred project folder (${folderVal})`,
          pluginId: 'file_automation',
          kind: 'workflow_memory_save',
          agent: 'memory',
          params: {
            key: 'preferred_web_folder',
            label: 'Preferred Website Projects Folder',
            value: folderVal,
            category: 'folder',
          },
          verification: {
            type: 'result_non_empty',
            description: 'Verify workflow preference saved to SQLite',
          },
          recovery: { maxRetries: 1, userHelpHint: 'Check SQLite storage permissions.' },
        })
      );
    }
    // Scenario A: YouTube Music / Video Play & Search (explicit YouTube or browser + play song/music/video)
    else if (
      (/\b(youtube|yt)\b/i.test(lower) ||
        (/\b(chrome|edge|brave|browser)\b/i.test(lower) &&
          !/\b(local|downloaded|offline|my\s+(?:music|songs?|playlist|folder))\b/i.test(lower))) &&
      /\b(play|search|open|bajao|chala|lofi|music|song|songs|video|gana|gaana|sunao)\b/i.test(lower) &&
      !/\b(pause|next|previous|volume|mute|resume|fullscreen)\b/i.test(lower)
    ) {
      scenarioKey = 'youtube_search_play';
      const requestedBrowser: 'chrome' | 'edge' = /\bedge\b/i.test(lower)
        ? 'edge'
        : /\bchrome\b/i.test(lower)
          ? 'chrome'
          : preferredBrowser === 'edge'
            ? 'edge'
            : 'chrome';
      const query = extractTopic(
        rawGoal,
        [
          /\b(hey\s+friday|friday|open\s+chrome|open\s+edge|open\s+brave|open\s+browser|in\s+chrome|in\s+edge|chrome\s+kholo|edge\s+kholo|chrome|edge|youtube\s+pe|youtube\s+par|youtube|on\s+youtube|open\s+youtube|and|aur|play|search|bajao|chala|sunao|karo|kar|par|pe|mein|please)\b/gi,
        ],
        'lofi chill beats'
      );
      steps.push(
        makeStep({
          id: 'step-1',
          title: `Open ${requestedBrowser === 'edge' ? 'Microsoft Edge' : 'Google Chrome'}`,
          pluginId: 'browser_automation',
          kind: 'app_launch',
          agent: 'application',
          params: { target: requestedBrowser },
          verification: { type: 'window_or_url', description: 'Verify browser launch or URL handoff' },
          recovery: {
            maxRetries: 1,
            fallbackAction: requestedBrowser === 'edge' ? 'chrome' : 'edge',
            userHelpHint: 'Ensure Chrome or Edge is installed on Windows.',
          },
        }),
        makeStep({
          id: 'step-2',
          title: `Search and open YouTube playback for "${query}"`,
          pluginId: 'youtube_automation',
          kind: 'youtube_play',
          agent: 'browser',
          params: { query, browser: requestedBrowser },
          dependsOn: ['step-1'],
          verification: { type: 'window_or_url', description: 'Verify YouTube watch/search URL resolved' },
          recovery: { maxRetries: 1, userHelpHint: 'Check internet access or open the verified YouTube link.' },
        })
      );
    }
    // YouTube / Media playback controls
    else if (/\b(pause|resume|next|previous|skip|volume|mute|fullscreen)\b/i.test(lower) && /\b(youtube|music|song|video|media|track|awaz)\b/i.test(lower)) {
      scenarioKey = 'youtube_media_control';
      const action = /\bnext|skip\b/i.test(lower)
        ? 'next'
        : /\bprev/i.test(lower)
          ? 'previous'
          : /\bvolume\s*up|increase|badha/i.test(lower)
            ? 'volume_up'
            : /\bvolume\s*down|decrease|kam/i.test(lower)
              ? 'volume_down'
              : /\bmute\b/i.test(lower)
                ? 'mute'
                : 'play_pause';
      steps.push(
        makeStep({
          id: 'step-1',
          title: `Execute media control (${action})`,
          pluginId: /\byoutube\b/i.test(lower) ? 'youtube_automation' : 'media_automation',
          kind: 'media_control',
          agent: 'media',
          params: { action },
          verification: { type: 'window_or_url', description: 'Verify media control command dispatched' },
          recovery: { maxRetries: 1, userHelpHint: 'Focus the browser/media player window on Windows.' },
        })
      );
    }
    // Scenario B: Research in Browser + Create Word Document (.docx)
    else if (/\b(word|docx|document|report)\b/i.test(lower) && /\b(create|make|write|generate|save|research|banao|likho)\b/i.test(lower)) {
      scenarioKey = 'research_word_document';
      const wantsResearch = /\b(research|search|browser|chrome|web|topic|about)\b/i.test(lower);
      const topic = extractTopic(
        rawGoal,
        [
          /\b(hey\s+friday|friday|open\s+chrome|chrome|browser|research|search|about|on|and|aur|create|make|generate|write|save|a|an|the|word|docx|document|report|file|in|to|banao|likho|karo)\b/gi,
          /[a-zA-Z]:\\[^\s"'<>|]+/g,
        ],
        'Artificial Intelligence Overview'
      );
      const safeSlug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'report';
      const outDir = explicitPath || defaultWorkspace;
      const outFile = path.join(outDir, `${safeSlug}-report.docx`);
      targetPath = outFile;

      const perm = PermissionManager.evaluateFileOperation({
        operation: 'write',
        targetPath: outFile,
        allowedFolders: ctx.allowedFolders,
        approvedExternalPaths: ctx.approvedExternalPaths,
        explicitlyConfirmed: ctx.confirmedAction,
      });
      riskLevel = perm.risk;
      if (perm.requiresConfirmation) {
        requiresConfirmation = true;
        confirmationReason = perm.reason;
      }

      if (wantsResearch) {
        steps.push(
          makeStep({
            id: 'step-1',
            title: `Research "${topic}" via BrowserAutomation`,
            pluginId: 'browser_automation',
            kind: 'browser_research',
            agent: 'browser',
            params: { query: topic, mode: 'web' },
            verification: { type: 'result_non_empty', description: 'Verify research synthesis produced' },
            recovery: { maxRetries: 1, userHelpHint: 'Will synthesize structured outline offline if offline.' },
          })
        );
      }

      steps.push(
        makeStep({
          id: wantsResearch ? 'step-2' : 'step-1',
          title: `Generate verified Word document (${path.basename(outFile)})`,
          pluginId: 'word_automation',
          kind: 'office_word_create',
          agent: 'file',
          params: {
            outputPath: outFile,
            title: topic,
            useResearchFromStep: wantsResearch ? 'step-1' : undefined,
            openAfterCreate: true,
          },
          dependsOn: wantsResearch ? ['step-1'] : [],
          risk: perm.risk,
          requiresConfirmation: perm.requiresConfirmation,
          verification: { type: 'ooxml_valid', target: outFile, description: 'Verify .docx ZIP & Word XML structure' },
          recovery: { maxRetries: 1, userHelpHint: 'Ensure destination directory is writable.' },
        })
      );
    }
    // Scenario D: Excel Sheet with Formulas & Expense Summary
    else if (/\b(excel|xlsx|spreadsheet|expense\s*sheet|monthly\s*expenses)\b/i.test(lower)) {
      scenarioKey = 'excel_expense_sheet';
      const title = extractTopic(
        rawGoal,
        [
          /\b(hey\s+friday|friday|open|create|make|generate|save|an|a|the|excel|xlsx|spreadsheet|sheet|file|with|and|formula|formulas|summary|total|banao)\b/gi,
          /[a-zA-Z]:\\[^\s"'<>|]+/g,
        ],
        'Monthly Expenses'
      );
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28) || 'monthly-expenses';
      const outDir = explicitPath || defaultWorkspace;
      const outFile = path.join(outDir, `${slug}.xlsx`);
      targetPath = outFile;

      const perm = PermissionManager.evaluateFileOperation({
        operation: 'write',
        targetPath: outFile,
        allowedFolders: ctx.allowedFolders,
        approvedExternalPaths: ctx.approvedExternalPaths,
        explicitlyConfirmed: ctx.confirmedAction,
      });
      riskLevel = perm.risk;
      if (perm.requiresConfirmation) {
        requiresConfirmation = true;
        confirmationReason = perm.reason;
      }

      steps.push(
        makeStep({
          id: 'step-1',
          title: `Create Excel workbook "${path.basename(outFile)}" with formulas`,
          pluginId: 'excel_automation',
          kind: 'office_excel_create',
          agent: 'file',
          params: {
            outputPath: outFile,
            title,
            includeFormulas: true,
            openAfterCreate: true,
          },
          risk: perm.risk,
          requiresConfirmation: perm.requiresConfirmation,
          verification: { type: 'ooxml_valid', target: outFile, description: 'Verify .xlsx archive and formula cells' },
          recovery: { maxRetries: 1, userHelpHint: 'Verify folder write permissions.' },
        })
      );
    }
    // Scenario E: PowerPoint Presentation (.pptx)
    else if (/\b(powerpoint|pptx|ppt|presentation|slides?)\b/i.test(lower)) {
      scenarioKey = 'powerpoint_presentation';
      const topic = extractTopic(
        rawGoal,
        [
          /\b(hey\s+friday|friday|create|make|generate|open|a|an|the|powerpoint|pptx|ppt|presentation|slides?|deck|on|about|for|topic|banao)\b/gi,
          /[a-zA-Z]:\\[^\s"'<>|]+/g,
        ],
        'Artificial Intelligence'
      );
      const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28) || 'presentation';
      const outDir = explicitPath || defaultWorkspace;
      const outFile = path.join(outDir, `${slug}-deck.pptx`);
      targetPath = outFile;

      const perm = PermissionManager.evaluateFileOperation({
        operation: 'write',
        targetPath: outFile,
        allowedFolders: ctx.allowedFolders,
        approvedExternalPaths: ctx.approvedExternalPaths,
        explicitlyConfirmed: ctx.confirmedAction,
      });
      riskLevel = perm.risk;
      if (perm.requiresConfirmation) {
        requiresConfirmation = true;
        confirmationReason = perm.reason;
      }

      steps.push(
        makeStep({
          id: 'step-1',
          title: `Create PowerPoint deck "${path.basename(outFile)}" (${topic})`,
          pluginId: 'powerpoint_automation',
          kind: 'office_powerpoint_create',
          agent: 'file',
          params: {
            outputPath: outFile,
            topic,
            slideCount: 5,
            openAfterCreate: true,
          },
          risk: perm.risk,
          requiresConfirmation: perm.requiresConfirmation,
          verification: { type: 'ooxml_valid', target: outFile, description: 'Verify .pptx archive and slide XMLs' },
          recovery: { maxRetries: 1, userHelpHint: 'Check folder write permissions.' },
        })
      );
    }
    // Scenario C: VS Code + Login Website / Web Project + Run + Verify + Fix
    else if (
      /\b(login\s*page|website|web\s*project|landing\s*page|html\s*css|html\s+and\s+css)\b/i.test(lower) ||
      (/\b(vs\s*code|vscode)\b/i.test(lower) && /\b(create|make|open|folder|project|code|test|fix|banao)\b/i.test(lower))
    ) {
      const isLogin = /\blogin\b/i.test(lower);
      scenarioKey = isLogin ? 'vscode_login_website' : 'vscode_web_project';

      let baseDir = explicitPath;
      if (!baseDir && preferredWebFolder) {
        baseDir = preferredWebFolder;
        usesPreferences.push(`preferred_web_folder=${preferredWebFolder}`);
      }
      if (!baseDir) {
        baseDir = path.join(defaultWorkspace, 'web-projects');
      }
      const projectFolder = path.join(baseDir, isLogin ? 'login-portal' : 'web-starter');
      targetPath = projectFolder;

      const perm = PermissionManager.evaluateFileOperation({
        operation: 'create_folder',
        targetPath: projectFolder,
        allowedFolders: ctx.allowedFolders,
        approvedExternalPaths: ctx.approvedExternalPaths,
        explicitlyConfirmed: ctx.confirmedAction,
      });
      riskLevel = perm.risk;
      if (perm.requiresConfirmation) {
        requiresConfirmation = true;
        confirmationReason = perm.reason;
      }

      steps.push(
        makeStep({
          id: 'step-1',
          title: `Create project folder (${projectFolder})`,
          pluginId: 'file_automation',
          kind: 'folder_create',
          agent: 'file',
          params: { folderPath: projectFolder },
          risk: perm.risk,
          requiresConfirmation: perm.requiresConfirmation,
          verification: { type: 'file_exists', target: projectFolder, description: 'Verify project folder created' },
          recovery: { maxRetries: 1, userHelpHint: 'Approve folder creation or check drive path.' },
        }),
        makeStep({
          id: 'step-2',
          title: isLogin ? 'Generate HTML, CSS & JS login page files' : 'Generate HTML, CSS & JS website files',
          pluginId: 'vscode_automation',
          kind: 'code_scaffold',
          agent: 'automation',
          params: {
            projectDir: projectFolder,
            template: isLogin ? 'login' : 'landing',
            projectTitle: isLogin ? 'LoginPortal' : 'FridayWebApp',
          },
          dependsOn: ['step-1'],
          risk: 'medium',
          verification: {
            type: 'file_exists',
            target: path.join(projectFolder, 'index.html'),
            description: 'Verify index.html, styles.css, and app.js written',
          },
          recovery: { maxRetries: 1, userHelpHint: 'Ensure directory is writable.' },
        }),
        makeStep({
          id: 'step-3',
          title: 'Validate HTML/CSS/JS syntax & auto-fix if needed',
          pluginId: 'vscode_automation',
          kind: 'code_syntax_check',
          agent: 'automation',
          params: { projectDir: projectFolder, autoFix: true },
          dependsOn: ['step-2'],
          verification: { type: 'syntax_valid', description: 'Verify zero HTML/CSS/JS syntax errors' },
          recovery: { maxRetries: 2, fallbackAction: 'auto_fix', userHelpHint: 'Inspect reported line in app.js/index.html.' },
        }),
        makeStep({
          id: 'step-4',
          title: 'Start local preview & verify HTTP 200 rendered page',
          pluginId: 'vscode_automation',
          kind: 'code_preview_verify',
          agent: 'browser',
          params: { projectDir: projectFolder, openBrowser: true, openEditor: preferredEditor },
          dependsOn: ['step-3'],
          verification: { type: 'http_ok', description: 'Verify live HTTP 200 response from generated website' },
          recovery: { maxRetries: 1, userHelpHint: 'Check port availability for local preview.' },
        })
      );
    }
    // Scenario F: Notepad / Editor C, C++, Python, or Node Code Writing
    else if (/\b(notepad|c\s+program|cpp|python\s+script)\b/i.test(lower) && /\b(write|create|hello\s*world|program|code|save|likho|banao)\b/i.test(lower)) {
      scenarioKey = 'notepad_code_write';
      const lang: 'c' | 'cpp' | 'python' | 'node' = /\bc\+\+|cpp\b/i.test(lower)
        ? 'cpp'
        : /\bpython|\.py\b/i.test(lower)
          ? 'python'
          : /\bnode|\.js|\.mjs\b/i.test(lower)
            ? 'node'
            : 'c';
      const ext = lang === 'cpp' ? 'cpp' : lang === 'python' ? 'py' : lang === 'node' ? 'mjs' : 'c';
      const outDir = explicitPath || path.join(defaultWorkspace, 'programs');
      const outFile = path.join(outDir, `hello.${ext}`);
      targetPath = outFile;

      const perm = PermissionManager.evaluateFileOperation({
        operation: 'write',
        targetPath: outFile,
        allowedFolders: ctx.allowedFolders,
        approvedExternalPaths: ctx.approvedExternalPaths,
        explicitlyConfirmed: ctx.confirmedAction,
      });
      riskLevel = perm.risk;
      requiresConfirmation = perm.requiresConfirmation;
      confirmationReason = perm.reason;

      steps.push(
        makeStep({
          id: 'step-1',
          title: `Write ${lang.toUpperCase()} program (${path.basename(outFile)})`,
          pluginId: 'notepad_automation',
          kind: 'code_scaffold',
          agent: 'file',
          params: {
            projectDir: outDir,
            template: lang,
            filePath: outFile,
            goalText: rawGoal,
            openInApp: /\bnotepad\b/i.test(lower) ? 'notepad' : 'code',
          },
          risk: perm.risk,
          requiresConfirmation: perm.requiresConfirmation,
          verification: { type: 'file_exists', target: outFile, description: `Verify ${path.basename(outFile)} saved` },
          recovery: { maxRetries: 1, userHelpHint: 'Verify folder write permissions.' },
        })
      );
    }
    // Folder Creation (e.g. "Create a folder on D drive", "Friday, ek folder bana D drive mein")
    else if (extractFolderCreationSpec(rawGoal).matched) {
      const spec = extractFolderCreationSpec(rawGoal);
      scenarioKey = 'create_folder';
      const folderPath =
        spec.explicitPath ||
        (spec.driveLetter ? `${spec.driveLetter}:\\${spec.folderName}` : path.join(defaultWorkspace, spec.folderName));
      targetPath = folderPath;

      const perm = PermissionManager.evaluateFileOperation({
        operation: 'create_folder',
        targetPath: folderPath,
        allowedFolders: ctx.allowedFolders,
        approvedExternalPaths: ctx.approvedExternalPaths,
        explicitlyConfirmed: ctx.confirmedAction,
      });
      riskLevel = perm.risk;
      if (perm.requiresConfirmation) {
        requiresConfirmation = true;
        confirmationReason = perm.reason;
      }

      steps.push(
        makeStep({
          id: 'step-1',
          title: `Create folder "${folderPath}"`,
          pluginId: 'file_automation',
          kind: 'folder_create',
          agent: 'file',
          params: { folderPath },
          risk: perm.risk,
          requiresConfirmation: perm.requiresConfirmation,
          verification: { type: 'file_exists', target: folderPath, description: `Verify folder ${folderPath} exists` },
          recovery: { maxRetries: 1, userHelpHint: 'Approve folder creation or verify drive path availability on Windows.' },
        })
      );
    }
    // File Organize / Delete / Move / Copy
    else if (/\b(organize|sort)\b.*\b(files?|downloads?|desktop|documents?|folder)\b/i.test(lower)) {
      scenarioKey = 'file_organize';
      const folderDir = explicitPath || defaultWorkspace;
      targetPath = folderDir;
      riskLevel = 'medium';
      steps.push(
        makeStep({
          id: 'step-1',
          title: `Inspect & organize files in ${folderDir}`,
          pluginId: 'file_automation',
          kind: 'file_organize',
          agent: 'file',
          params: { folderPath: folderDir, dryRun: !ctx.confirmedAction },
          risk: 'medium',
          requiresConfirmation: !ctx.confirmedAction,
          verification: { type: 'result_non_empty', description: 'Verify file organization plan or result' },
          recovery: { maxRetries: 0, userHelpHint: 'Confirm before moving files into category subfolders.' },
        })
      );
      if (!ctx.confirmedAction) {
        requiresConfirmation = true;
        confirmationReason = `Organizing files inside "${folderDir}" moves files into category subfolders. Confirm to proceed.`;
      }
    }
    else if (/\b(delete|remove|erase)\b.*\b(file|folder|directory)\b/i.test(lower)) {
      scenarioKey = 'file_delete_gated';
      riskLevel = 'high';
      requiresConfirmation = !ctx.confirmedAction;
      confirmationReason = 'File/folder deletion is destructive and requires explicit confirmation.';
      const target = explicitPath || rawGoal.replace(/^.*?\b(?:delete|remove|erase)\s+(?:file|folder)?\s*/i, '').trim();
      targetPath = target;
      steps.push(
        makeStep({
          id: 'step-1',
          title: `Delete target (${target})`,
          pluginId: 'file_automation',
          kind: 'file_delete',
          agent: 'file',
          params: { targetPath: target, confirmed: Boolean(ctx.confirmedAction) },
          risk: 'high',
          requiresConfirmation: !ctx.confirmedAction,
          verification: { type: 'result_non_empty', description: 'Verify reversible backup/removal outcome' },
          recovery: { maxRetries: 0, userHelpHint: 'Confirm the exact file path before deletion.' },
        })
      );
    }
    // Terminal Execution
    else if (/\b(run\s+(?:terminal|command|cmd|powershell)|execute\s+command)\b/i.test(lower) || /^(?:npm\s+test|git\s+status|dir|ls|node\s+-v)\b/i.test(lower)) {
      scenarioKey = 'terminal_command';
      const cmdMatch = rawGoal.match(/(?:run\s+(?:terminal|command|cmd|powershell)\s*[:\-]?\s*|execute\s+command\s*[:\-]?\s*)(.+)$/i);
      const commandStr = (cmdMatch?.[1] || rawGoal).trim();
      const assessment = classifyTerminalCommandRisk(commandStr);
      riskLevel = assessment.risk === 'HIGH' ? 'high' : assessment.risk === 'MODERATE' ? 'medium' : 'low';
      if (!assessment.allowed || assessment.requiresConfirmation) {
        requiresConfirmation = !ctx.confirmedAction || !assessment.allowed;
        confirmationReason = assessment.reason;
      }
      steps.push(
        makeStep({
          id: 'step-1',
          title: `Execute terminal command (${assessment.risk})`,
          pluginId: 'terminal_automation',
          kind: 'terminal_execute',
          agent: 'system',
          params: { command: commandStr, cwd: defaultWorkspace, confirmed: Boolean(ctx.confirmedAction) },
          risk: riskLevel,
          requiresConfirmation,
          verification: { type: 'process_started', description: 'Verify command exit code and output capture' },
          recovery: { maxRetries: 0, userHelpHint: assessment.reason },
        })
      );
    }
    // Screen Read / OCR Inspection
    else if (/\b(read\s+screen|ocr\s+screen|what\s+is\s+on\s+(?:my\s+)?screen|screen\s+text)\b/i.test(lower)) {
      scenarioKey = 'screen_ocr_inspect';
      steps.push(
        makeStep({
          id: 'step-1',
          title: 'Inspect active window UIA tree and screen text',
          pluginId: 'windows_automation',
          kind: 'screen_inspect',
          agent: 'vision',
          params: {},
          verification: { type: 'result_non_empty', description: 'Verify screen/window accessibility or OCR inspection' },
          recovery: { maxRetries: 1, userHelpHint: 'Ensure desktop session is active or grant Screen Capture consent.' },
        })
      );
    }
    // Fallback general browser / app launch automation
    else {
      steps.push(
        makeStep({
          id: 'step-1',
          title: `Execute automation goal: ${rawGoal.slice(0, 64)}`,
          pluginId: 'windows_automation',
          kind: 'app_launch',
          agent: 'automation',
          params: { target: rawGoal },
          verification: { type: 'window_or_url', description: 'Verify desktop action outcome' },
          recovery: { maxRetries: 1, userHelpHint: 'Clarify target application or folder path.' },
        })
      );
    }

    return {
      id: planId,
      goal: rawGoal,
      normalizedGoal: normText,
      scenarioKey,
      language: detectedLang,
      riskLevel,
      requiresConfirmation,
      confirmationReason,
      targetPath,
      usesPreferences,
      steps,
      createdAt: nowIso,
    };
  }
}

export class AutomationBrain {
  static plan(goal: string, ctx: PlannerContext): WorkflowPlanSpec {
    return WorkflowPlanner.planGoal(goal, ctx);
  }
}
