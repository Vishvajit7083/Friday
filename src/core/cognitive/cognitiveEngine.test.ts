import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CognitiveOrchestrator,
  DynamicIntentRegistry,
  FutureLanguageCoreProvider,
  InMemoryCognitivePorts,
  LocalCognitiveModelProvider,
  applyLexiconCanonicalization,
  buildStructuredTaskPlan,
  decideExecutionRoute,
  detectCognitiveLanguage,
  detectRepeatedTaskPattern,
  encodeWithTokenizerArtifact,
  formatTrainingDatasetJsonl,
  isHinglishInterruptionPhrase,
  learnVocabularyTerm,
  levenshteinDistance,
  splitTrainEvalDataset,
  stringSimilarity,
  trainBpeStyleTokenizer,
  understandUserInput,
  type CognitiveToolAdapter,
  type CognitiveTurnInput,
  type TrainingDatasetSample,
} from './index';

function turn(rawText: string, online = true, confirmedAction = false): CognitiveTurnInput {
  return {
    rawText,
    userName: 'Siddesh',
    assistantName: 'F.R.I.D.A.Y.',
    online,
    confirmedAction,
    defaultLocation: 'Kolhapur, MH',
  };
}

function createMockToolAdapter(online = true): CognitiveToolAdapter {
  const createdReminders: string[] = [];
  return {
    isOnline: () => online,
    async getWeather(location, dateHint) {
      return {
        ok: true,
        summary: `Kolhapur (${location || 'Kolhapur, MH'}) ${dateHint || 'today'}: 29°C clear skies, light breeze.`,
      };
    },
    async getSystemTelemetry() {
      return {
        ok: true,
        summary: 'CPU 18% (8 cores), RAM 7.2/16 GB (45%), Storage 180/512 GB.',
      };
    },
    async openApp(appTarget) {
      return { ok: true, summary: `Launched ${appTarget}.`, target: appTarget };
    },
    async openFolder(folderTarget) {
      return { ok: true, summary: `Opened folder ${folderTarget}.`, path: `D:/Workspace/${folderTarget}` };
    },
    async listFolderContents(folderTarget) {
      return {
        ok: true,
        summary: `Inside ${folderTarget || 'project'}: src/, package.json, README.md.`,
        items: [
          { id: '1', label: 'src/', kind: 'folder', target: 'D:/Workspace/src', intentId: 'tool.open_folder' },
          { id: '2', label: 'package.json', kind: 'file', target: 'D:/Workspace/package.json', intentId: 'tool.file_search' },
        ],
      };
    },
    async searchFiles(query) {
      return {
        ok: true,
        summary: `Found 1 file matching "${query}": budget_2026.xlsx`,
        items: [
          { id: 'f1', label: 'budget_2026.xlsx', kind: 'file', target: 'D:/Docs/budget_2026.xlsx', intentId: 'tool.file_search' },
        ],
      };
    },
    async createReminderOrTodo(title, dateHint) {
      createdReminders.push(title);
      return {
        ok: true,
        summary: `Reminder saved for ${dateHint || 'today'}: "${title}".`,
      };
    },
    async mediaControl(action) {
      return { ok: true, summary: `Executed media action ${action}.` };
    },
    async webResearch(query) {
      if (!online) {
        return { ok: false, summary: 'Internet offline.', sources: [] };
      }
      return {
        ok: true,
        summary: `Public web research summary for "${query}": TypeScript + SQLite offline architecture overview.`,
        sources: [{ title: 'TypeScript Docs', uri: 'https://www.typescriptlang.org/' }],
      };
    },
    async runActionByName(action, payload) {
      return { ok: true, summary: `Ran ${action} (${String(payload?.target || 'ok')}).` };
    },
  };
}

test('Hinglish NLP detects English, Hindi Devanagari, Hinglish, and mixed queries + interruption phrases', () => {
  assert.equal(detectCognitiveLanguage('Open Google Chrome now').language, 'english');
  assert.equal(detectCognitiveLanguage('मेरा फोल्डर खोलो').language, 'hindi');
  assert.equal(detectCognitiveLanguage('Kal ka weather check kar').language, 'hinglish');
  assert.equal(detectCognitiveLanguage('Thoda hindi mein samjha').language, 'hinglish');

  assert.equal(isHinglishInterruptionPhrase('ruk ja'), true);
  assert.equal(isHinglishInterruptionPhrase('chup kar'), true);
  assert.equal(isHinglishInterruptionPhrase('Friday bas'), true);
  assert.equal(isHinglishInterruptionPhrase('open chrome'), false);

  const canon = applyLexiconCanonicalization('chrome kholo');
  assert.equal(canon.canonicalTokens.includes('open'), true);
});

test('Language Understanding repairs ASR/spelling typos via Levenshtein fuzzy similarity', () => {
  assert.equal(levenshteinDistance('chrome', 'crom') <= 2, true);
  assert.equal(stringSimilarity('weather', 'wether') > 0.75, true);

  const u = understandUserInput('wether check kar crom kholo');
  assert.equal(u.correctedInput.includes('weather'), true);
  assert.equal(u.correctedInput.includes('chrome'), true);
  assert.equal(u.entities.app, 'chrome');
});

test('handles full Hinglish conversational suite, follow-ups, ordinal picks, save, pause/resume', async () => {
  const ports = new InMemoryCognitivePorts();
  ports.knowledgeChunks.push({
    chunk: {
      id: 'kb-1',
      title: 'Project Stack',
      content: 'F.R.I.D.A.Y. runs locally on SQLite with modular cognitive engines.',
      sourceType: 'fact',
      provenance: 'user_provided',
      tags: ['project', 'sqlite'],
      updatedAt: new Date().toISOString(),
    },
    score: 1,
    matchedTerms: ['sqlite'],
  });

  const orchestrator = new CognitiveOrchestrator({
    memoryStore: ports,
    knowledgeEngine: ports,
    learningStore: ports,
    toolAdapter: createMockToolAdapter(true),
    modelProvider: new LocalCognitiveModelProvider(),
    sessionId: 'test-session',
  });

  // 1. Greeting in Hinglish
  const greet = await orchestrator.processTurn(turn('Friday kya kar rahi hai?'));
  assert.equal(greet.language, 'hinglish');
  assert.equal(greet.reply.length > 10, true);
  assert.equal(/^(Certainly|Of course|As an AI)/i.test(greet.reply), false);

  // 2. Kal ka weather check kar
  const weatherRes = await orchestrator.processTurn(turn('Kal ka weather check kar'));
  assert.equal(weatherRes.intentId, 'intent.weather_check');
  assert.equal(weatherRes.reply.includes('29°C'), true);

  // 3. Thoda Hindi mein samjha (context follow-up)
  const hindiExplain = await orchestrator.processTurn(turn('Thoda Hindi mein samjha'));
  assert.equal(hindiExplain.intentId, 'intent.explain_hindi_simple');
  assert.equal(hindiExplain.reply.length > 10, true);

  // 4. Jo last mein bola tha wo repeat kar
  const repeatRes = await orchestrator.processTurn(turn('Jo last mein bola tha wo repeat kar'));
  assert.equal(repeatRes.intentId, 'intent.repeat_last');
  assert.equal(repeatRes.reply.includes(hindiExplain.reply), true);

  // 5. Is folder ke andar kya hai? -> Ab doosra wala kar
  const folderList = await orchestrator.processTurn(turn('Is folder ke andar kya hai?'));
  assert.equal(folderList.intentId, 'intent.folder_inspect');
  const secondPick = await orchestrator.processTurn(turn('Ab doosra wala kar'));
  assert.equal(secondPick.reply.includes('package.json'), true);

  // 6. Chrome kholo
  const chromeRes = await orchestrator.processTurn(turn('Chrome kholo'));
  assert.equal(chromeRes.intentId, 'intent.open_app');
  assert.equal(chromeRes.reply.includes('chrome'), true);

  // 7. Ek reminder laga de & Isko save kar
  const remRes = await orchestrator.processTurn(turn('Ek reminder laga de drink water'));
  assert.equal(remRes.intentId, 'intent.reminder_create');
  const saveRes = await orchestrator.processTurn(turn('Isko save kar'));
  assert.equal(saveRes.intentId, 'intent.memory_save');
  assert.equal(ports.memories.some((m) => m.layer === 'long_term'), true);

  // 8. Kal jo project discuss kiya tha usko continue kar
  ports.save({
    layer: 'episodic',
    category: 'project',
    key: 'Friday Cognitive Project',
    value: 'Working on Hinglish NLP and SQLite cognitive memory integration',
    tags: ['project'],
    importance: 0.9,
    confidence: 0.9,
    source: 'user_provided',
  });
  const resumeProj = await orchestrator.processTurn(
    turn('Kal jo project discuss kiya tha usko continue kar')
  );
  assert.equal(
    resumeProj.reply.includes('Friday Cognitive Project') || resumeProj.reply.includes('Hinglish'),
    true
  );
});

test('Level 2 correction learning and dynamic custom intent teaching + execution + pause/resume', async () => {
  const ports = new InMemoryCognitivePorts();
  const orchestrator = new CognitiveOrchestrator({
    memoryStore: ports,
    knowledgeEngine: ports,
    learningStore: ports,
    toolAdapter: createMockToolAdapter(true),
    sessionId: 'test-learn',
  });

  // Wrong turn -> correction flow
  await orchestrator.processTurn(turn('play music please'));
  await orchestrator.processTurn(turn('Arey nahi, maine ye nahi bola'));
  const corrected = await orchestrator.processTurn(turn('No, open my project folder'));
  assert.equal(ports.corrections.length >= 1, true);
  assert.equal(corrected.intentId, 'intent.folder_inspect');

  // Teach dynamic intent
  const teachRes = await orchestrator.processTurn(
    turn('Friday, when I say coding mode, open VS Code and my project folder')
  );
  assert.equal(teachRes.intentId, 'intent.teach_custom_command');
  const taughtIntent = ports.customIntents.find((i) => i.userDefined);
  assert.ok(taughtIntent);

  // Invoke taught intent later
  const invokeRes = await orchestrator.processTurn(turn('coding mode'));
  assert.equal(invokeRes.intentId, taughtIntent!.id);
  assert.equal((invokeRes.taskPlan?.steps.length ?? 0) >= 2, true);

  // Interrupt ("Ruk ja") pauses active plan, "Ab continue kar" resumes
  const reg = new DynamicIntentRegistry();
  const customPlanIntent = reg.teachCustomIntent('coding mode', 'open vscode and my project folder');
  orchestrator.getContextState().activeTaskPlan = buildStructuredTaskPlan({
    goal: 'open vscode and my project folder',
    intent: customPlanIntent,
    understanding: understandUserInput('open vscode and my project folder', []),
  });
  const paused = await orchestrator.processTurn(turn('Ruk ja'));
  assert.equal(paused.pausedOrStopped, true);
  assert.ok(orchestrator.getContextState().pausedTaskPlan);

  const resumed = await orchestrator.processTurn(turn('Ab continue kar'));
  assert.equal(
    resumed.reply.toLowerCase().includes('resum') || resumed.reply.toLowerCase().includes('vscode'),
    true
  );
});

test('Confirmation gate blocks risky folder organization until approved, and offline routing stays honest', async () => {
  const ports = new InMemoryCognitivePorts();
  const offlineOrchestrator = new CognitiveOrchestrator({
    memoryStore: ports,
    knowledgeEngine: ports,
    learningStore: ports,
    toolAdapter: createMockToolAdapter(false),
    sessionId: 'test-confirm-offline',
  });

  const gated = await offlineOrchestrator.processTurn(turn('organize my project folder', false));
  assert.equal(gated.requiresConfirmation, true);
  assert.equal(gated.decision.route, 'require_confirmation');

  const approved = await offlineOrchestrator.processTurn(
    turn('organize my project folder', false, true)
  );
  assert.equal(approved.requiresConfirmation, false);

  // Offline weather check gives honest offline message
  const offWeather = await offlineOrchestrator.processTurn(turn('Kal ka weather check kar', false));
  assert.equal(offWeather.decision.route, 'offline_honest_fallback');
  assert.equal(offWeather.reply.toLowerCase().includes('offline'), true);

  // Unknown fact without KB or internet gives honest unknown response
  const unknown = await offlineOrchestrator.processTurn(
    turn('What is the population of Atlantis in 2099?', false)
  );
  assert.equal(unknown.provenance, 'unknown');
});

test('Learning Levels 1, 4, 5, 6: lexicon, pattern detection, JSONL export, BPE tokenizer & Language Core scaffold', () => {
  // Level 1
  const lex = [] as ReturnType<typeof learnVocabularyTerm>[];
  const entry = learnVocabularyTerm(lex, 'nikal', 'open', 'hinglish', 'verb');
  assert.equal(entry.canonical, 'open');

  // Level 4
  const suggestions: ReturnType<typeof detectRepeatedTaskPattern> extends infer R ? NonNullable<R>[] : never = [];
  const pat = detectRepeatedTaskPattern(
    ['intent.open_app', 'intent.open_folder', 'intent.open_app', 'intent.open_folder'],
    suggestions
  );
  assert.ok(pat);
  assert.equal(pat!.occurrences >= 2, true);

  // Level 5 & 6
  const samples: TrainingDatasetSample[] = [
    {
      id: '1',
      prompt: 'Friday chrome kholo',
      normalizedPrompt: 'chrome kholo',
      language: 'hinglish',
      intentId: 'intent.open_app',
      entities: { app: 'chrome', numbers: [] },
      response: 'Chrome khol diya hai.',
      qualityScore: 0.95,
      approved: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      prompt: 'Kal ka weather check kar',
      normalizedPrompt: 'kal ka weather check kar',
      language: 'hinglish',
      intentId: 'intent.weather_check',
      entities: { dateHint: 'tomorrow', numbers: [] },
      response: 'Kal ka weather clear rahega.',
      qualityScore: 0.92,
      approved: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: '3',
      prompt: 'Thoda Hindi mein samjha',
      normalizedPrompt: 'thoda hindi mein samjha',
      language: 'hinglish',
      intentId: 'intent.explain_hindi_simple',
      entities: { numbers: [] },
      response: 'Aasaan Hindi mein: sab local chal raha hai.',
      qualityScore: 0.9,
      approved: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: '4',
      prompt: 'Is folder ke andar kya hai',
      normalizedPrompt: 'is folder ke andar kya hai',
      language: 'hinglish',
      intentId: 'intent.folder_inspect',
      entities: { folder: 'project', numbers: [] },
      response: 'Folder ke andar src aur package.json hain.',
      qualityScore: 0.91,
      approved: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const jsonl = formatTrainingDatasetJsonl(samples);
  assert.equal(jsonl.split('\n').length, 4);

  const split = splitTrainEvalDataset(samples, 0.25);
  assert.equal(split.train.length >= 2, true);
  assert.equal(split.eval.length >= 1, true);

  const tokenizer = trainBpeStyleTokenizer(samples, 24);
  assert.equal(tokenizer.vocabSize > 10, true);
  assert.equal(tokenizer.mergePairs.length > 0, true);

  const encoded = encodeWithTokenizerArtifact(tokenizer, 'chrome kholo');
  assert.equal(encoded[0], tokenizer.tokenToId['<bos>']);
  assert.equal(encoded[encoded.length - 1], tokenizer.tokenToId['<eos>']);

  const provider = new FutureLanguageCoreProvider();
  assert.equal(provider.isReady(), false);
  assert.equal(provider.describeCapabilities().includes('never fabricates'), true);

  const registry = new DynamicIntentRegistry();
  const taught = registry.teachCustomIntent('coding mode', 'open vscode');
  assert.equal(taught.userDefined, true);
  const route = decideExecutionRoute({
    understanding: understandUserInput('search online for quantum physics', []),
    topIntent: registry.getById('intent.web_research'),
    confidence: 0.82,
    online: false,
    hasKnowledgeHit: false,
  });
  assert.equal(route.route, 'offline_honest_fallback');
});

test('SQLite 6-layer cognitive memory, dynamic intents, JSON export/import & Knowledge Engine work in isolated dir', async () => {
  const prevDir = process.env.FRIDAY_DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-cog-test-'));
  process.env.FRIDAY_DATA_DIR = tempDir;

  try {
    const dbMod = await import('../../../server/cognitiveDb.ts');
    const kbMod = await import('../../../server/knowledgeEngine.ts');

    const saved = dbMod.saveCognitiveMemory({
      layer: 'semantic',
      category: 'architecture',
      key: 'Friday Database Engine',
      value: 'Built-in node:sqlite DatabaseSync stores 6 memory layers locally.',
      tags: ['sqlite', 'memory'],
      importance: 0.95,
      confidence: 1,
      source: 'user_provided',
    });
    assert.ok(saved.id);

    const found = dbMod.searchCognitiveMemories({ query: 'DatabaseSync', layer: 'semantic' });
    assert.equal(found.length, 1);

    const exportedJson = dbMod.exportCognitiveMemoriesJson();
    assert.equal(exportedJson.includes('Friday Database Engine'), true);

    assert.equal(dbMod.deleteCognitiveMemory(saved.id), true);
    const importedCount = dbMod.importCognitiveMemoriesJson(JSON.parse(exportedJson));
    assert.equal(importedCount >= 1, true);

    const fact = kbMod.addUserKnowledgeFact({
      title: 'Local Auth Policy',
      content: 'F.R.I.D.A.Y. never calls paid inference APIs or Gemini.',
      tags: ['policy'],
    });
    assert.equal(fact.provenance, 'user_provided');

    const kbHits = kbMod.searchKnowledgeBase('paid inference APIs', 5);
    assert.equal(kbHits.length >= 1, true);
  } finally {
    if (prevDir === undefined) {
      delete process.env.FRIDAY_DATA_DIR;
    } else {
      process.env.FRIDAY_DATA_DIR = prevDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
