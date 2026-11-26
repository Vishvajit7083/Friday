import crypto from 'crypto';
import type { NoteItem } from '../src/core/types.ts';
import type { KnowledgeChunk, KnowledgeProvenance, KnowledgeSearchResult } from '../src/core/cognitive/types.ts';
import { getCachedFileIndex } from './fileService.ts';
import {
  listCognitiveMemories,
  listCustomLexicon,
  listKnowledgeChunks,
  upsertKnowledgeChunk,
} from './cognitiveDb.ts';
import { stringSimilarity } from '../src/core/cognitive/languageUnderstanding.ts';
import { lookupBuiltinKnowledge } from '../src/core/cognitive/builtinKnowledge.ts';
import { DEFAULT_HINGLISH_LEXICON } from '../src/core/cognitive/vocabularyData.ts';

export function indexKnowledgeSources(params: {
  allowedFolders: string[];
  pausedIndexing: boolean;
  notes?: NoteItem[] | Array<{ id: string; title: string; content: string; updatedAt: string }>;
}): { indexedCount: number } {
  let count = 0;
  const now = new Date().toISOString();

  // 1. Permitted readable files (text, markdown, code previews)
  const files = getCachedFileIndex(params.allowedFolders, params.pausedIndexing, 150);
  for (const file of files) {
    if (!file.previewText || !file.previewText.trim()) continue;
    upsertKnowledgeChunk({
      id: `know-file-${file.id}`,
      title: file.name,
      content: file.previewText.slice(0, 2000),
      sourceType: 'file',
      sourcePath: file.relativePath,
      provenance: 'retrieved',
      tags: [file.extension, file.category, 'local-file'],
      updatedAt: file.modifiedAt || now,
    });
    count += 1;
  }

  // 2. User notes
  if (Array.isArray(params.notes)) {
    for (const note of params.notes) {
      if (!note.content?.trim()) continue;
      upsertKnowledgeChunk({
        id: `know-note-${note.id}`,
        title: note.title || 'User Note',
        content: note.content.slice(0, 2000),
        sourceType: 'note',
        provenance: 'user_provided',
        tags: ['note', 'user-note'],
        updatedAt: note.updatedAt || now,
      });
      count += 1;
    }
  }

  // 3. Semantic memory facts
  const semantic = listCognitiveMemories('semantic', 50);
  for (const mem of semantic) {
    upsertKnowledgeChunk({
      id: `know-sem-${mem.id}`,
      title: mem.key,
      content: mem.value,
      sourceType: 'fact',
      provenance: mem.source,
      tags: ['semantic', ...mem.tags],
      updatedAt: mem.updatedAt,
    });
    count += 1;
  }

  // 4. Built-in F.R.I.D.A.Y. FAQs
  const faqs: Array<{ id: string; title: string; content: string }> = [
    {
      id: 'know-faq-offline',
      title: 'F.R.I.D.A.Y. Offline Capabilities FAQ',
      content:
        'F.R.I.D.A.Y. Cognitive Engine runs 100% locally without Ollama, OpenAI, Gemini, Claude, or Groq. Apps, permitted folders, notes, reminders, 6-layer SQLite memory, Hinglish NLP, math, unit conversion, and custom taught commands work completely offline. Only live weather and public web search require internet connectivity.',
    },
    {
      id: 'know-faq-voice-hindi',
      title: 'Windows Speech Hindi & Hinglish FAQ',
      content:
        'Windows built-in System.Speech offline recognizer reliably recognizes English if installed, while Hindi/Hinglish recognition depends on Windows Language Packs or Chromium Web Speech API. F.R.I.D.A.Y. supports Hinglish text, ASR typo tolerance, Hinglish interruption phrases (ruk ja, chup, bas), and pluggable local Whisper/Vosk adapters.',
    },
  ];
  for (const faq of faqs) {
    upsertKnowledgeChunk({
      id: faq.id,
      title: faq.title,
      content: faq.content,
      sourceType: 'faq',
      provenance: 'retrieved',
      tags: ['faq', 'friday'],
      updatedAt: now,
    });
    count += 1;
  }

  return { indexedCount: count };
}

export function addUserKnowledgeFact(params: {
  title: string;
  content: string;
  tags?: string[];
  provenance?: KnowledgeProvenance;
}): KnowledgeChunk {
  const id = `know-fact-${crypto.createHash('sha1').update(`${params.title}:${Date.now()}`).digest('hex').slice(0, 12)}`;
  const chunk: KnowledgeChunk = {
    id,
    title: params.title.trim().slice(0, 160),
    content: params.content.trim().slice(0, 4000),
    sourceType: 'fact',
    provenance: params.provenance || 'user_provided',
    tags: params.tags?.length ? params.tags : ['user-fact'],
    updatedAt: new Date().toISOString(),
  };
  upsertKnowledgeChunk(chunk);
  return chunk;
}

export function searchKnowledgeBase(query: string, limit = 5): KnowledgeSearchResult[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];
  const terms = clean
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  const chunks = listKnowledgeChunks(300);

  // Also check custom + default Hinglish lexicon if user asks meaning of a vocabulary term
  const lexItems = [...DEFAULT_HINGLISH_LEXICON, ...listCustomLexicon()];
  const lexChunks: KnowledgeChunk[] = lexItems
    .filter((l) => terms.some((t) => l.phrase.toLowerCase().includes(t) || l.canonical.toLowerCase().includes(t)))
    .slice(0, 3)
    .map((l) => ({
      id: `know-lex-${l.id}`,
      title: `Vocabulary: "${l.phrase}" (${l.language})`,
      content: `Phrase "${l.phrase}" maps to canonical action "${l.canonical}" (${l.kind}). Synonyms: ${l.synonyms.join(', ') || 'none'}.`,
      sourceType: 'lexicon',
      provenance: l.userAdded ? 'user_provided' : 'retrieved',
      tags: ['lexicon', l.language],
      updatedAt: l.updatedAt,
    }));

  const builtin = lookupBuiltinKnowledge(query);
  const builtinChunks: KnowledgeChunk[] = builtin
    ? [
        {
          id: builtin.id,
          title: builtin.title,
          content: builtin.summary,
          sourceType: 'faq',
          provenance: 'retrieved',
          tags: builtin.tags,
          updatedAt: new Date().toISOString(),
        },
      ]
    : [];

  const combined = [...builtinChunks, ...chunks, ...lexChunks];

  return combined
    .map((chunk) => {
      const hay = `${chunk.title} ${chunk.content} ${chunk.tags.join(' ')}`.toLowerCase();
      const matchedTerms = terms.filter((t) => hay.includes(t));
      const titleBoost = terms.some((t) => chunk.title.toLowerCase().includes(t)) ? 1.5 : 0;
      const sim = stringSimilarity(clean, chunk.title.toLowerCase()) * 1.5;
      const score = Number((matchedTerms.length * 1.2 + titleBoost + sim).toFixed(2));
      return { chunk, score, matchedTerms };
    })
    .filter((r) => r.matchedTerms.length > 0 && r.score >= 1.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
