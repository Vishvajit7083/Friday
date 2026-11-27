import type {
  CognitiveLanguage,
  KnowledgeProvenance,
  ModelGenerationRequest,
  ModelGenerationResponse,
  ModelProvider,
  ResponseStyle,
} from './types';
import { adaptToneAndVoiceFriendliness, pickVariant } from './personalityEngine';

export function translateSummaryToSimpleHindi(summary: string, topic?: string): string {
  const trimmed = summary.trim();
  if (!trimmed) {
    return 'Abhi pichla reply available nahi hai jise Hindi mein samjha sakun.';
  }
  if (/^aasaan hindi mein/i.test(trimmed)) {
    return trimmed;
  }

  // Clean technical phrasing into clear, conversational simple Hindi/Hinglish using strict word boundaries
  const simplified = trimmed
    .replace(/\bCPU\b/gi, 'processor (CPU)')
    .replace(/\bRAM\b/gi, 'memory (RAM)')
    .replace(/\btelemetry\b/gi, 'system ki live report')
    .replace(/\bweather\b/gi, 'mausam')
    .replace(/\btemperature\b/gi, 'taapman')
    .replace(/\breminder\b/gi, 'yaad dilane wala alert')
    .replace(/\bconfirmation\b/gi, 'aapki permission')
    .replace(/\boffline\b/gi, 'bina internet')
    .replace(/\bretrieved from local\b/gi, 'local folder ya notes se mila');

  const prefix = topic
    ? `Aasaan Hindi mein (${topic}): `
    : 'Aasaan Hindi mein samjhun toh: ';

  return `${prefix}${simplified}`;
}

export function formatGroundedReply(req: ModelGenerationRequest): string {
  const { input, style, intentId, toolResultSummary, knowledgeHits, memoryHits, provenance, context } = req;

  if (toolResultSummary && toolResultSummary.trim()) {
    if (style === 'hindi_simple') {
      return adaptToneAndVoiceFriendliness(translateSummaryToSimpleHindi(toolResultSummary, context.activeTopic));
    }
    if (style === 'hinglish') {
      const lead = pickVariant(
        ['Ho gaya,', 'Yeh raha update:', 'Check kar liya —', 'Done,'],
        `${input}-${intentId}`
      );
      return adaptToneAndVoiceFriendliness(
        toolResultSummary.toLowerCase().startsWith(lead.toLowerCase())
          ? toolResultSummary
          : `${lead} ${toolResultSummary}`
      );
    }
    if (style === 'failure') {
      const lead = pickVariant(
        ['Heads up —', 'Could not complete that directly:', 'Hit a snag:'],
        input
      );
      return adaptToneAndVoiceFriendliness(`${lead} ${toolResultSummary}`);
    }
    return adaptToneAndVoiceFriendliness(toolResultSummary);
  }

  if (knowledgeHits.length > 0) {
    const top = knowledgeHits[0];
    const provenanceTag =
      provenance === 'retrieved'
        ? `From ${top.chunk.title}`
        : provenance === 'user_provided'
          ? `From your saved note "${top.chunk.title}"`
          : `Inferred from ${top.chunk.title}`;

    if (style === 'hindi_simple') {
      return adaptToneAndVoiceFriendliness(
        `${provenanceTag} — aasaan shabdon mein: ${top.chunk.content.slice(0, 260)}`
      );
    }
    if (style === 'hinglish') {
      return adaptToneAndVoiceFriendliness(`${provenanceTag}: ${top.chunk.content.slice(0, 260)}`);
    }
    return adaptToneAndVoiceFriendliness(`${provenanceTag}: ${top.chunk.content.slice(0, 280)}`);
  }

  if (memoryHits.length > 0) {
    const mem = memoryHits[0];
    if (style === 'hinglish' || style === 'hindi_simple') {
      return adaptToneAndVoiceFriendliness(
        `Meri ${mem.layer} memory mein "${mem.key}" saved hai: ${mem.value}`
      );
    }
    return adaptToneAndVoiceFriendliness(
      `From ${mem.layer} memory (${mem.key}): ${mem.value}`
    );
  }

  // Honest unknown fallback
  if (style === 'hinglish' || style === 'hindi_simple') {
    return pickVariant(
      [
        'Iske baare mein mere local notes ya memory mein pakki jaankari nahi hai. Chaaho toh bata do, main save kar lungi, ya online search karne bol sakte ho.',
        'Yeh info abhi meri local knowledge base mein nahi mili. Aap bataoge toh main yaad rakh lungi, ya internet online hone par web search kar sakti hoon.',
      ],
      input
    );
  }

  return pickVariant(
    [
      "I don't have verified information on that in local knowledge or memory yet. You can teach me or ask me to search online when connected.",
      'Nothing verified matched in your local notes or memory. Share the detail so I can save it, or ask for an online search.',
    ],
    input
  );
}

export class LocalCognitiveModelProvider implements ModelProvider {
  readonly id = 'friday-cognitive-engine';
  readonly name = 'F.R.I.D.A.Y. Cognitive Engine (Local Offline-First)';
  readonly kind = 'cognitive_local' as const;

  isReady(): boolean {
    return true;
  }

  describeCapabilities(): string {
    return 'Self-owned 15-module local cognitive brain: Hinglish NLP, 6-layer SQLite memory, dynamic intent registry, task planner, and grounded response engine.';
  }

  async generateResponse(req: ModelGenerationRequest): Promise<ModelGenerationResponse> {
    const text = formatGroundedReply(req);
    return {
      text,
      providerId: this.id,
      providerKind: this.kind,
      usedTrainedModel: false,
      confidence: req.confidence,
    };
  }
}

export function buildGreetingResponse(params: {
  userName: string;
  language: CognitiveLanguage;
  style: ResponseStyle;
  activeTopic?: string;
  seed: string;
}): string {
  if (params.style === 'hinglish' || params.style === 'hindi_simple' || params.language === 'hinglish' || params.language === 'hindi') {
    const topicBit = params.activeTopic ? ` Abhi hum "${params.activeTopic}" par kaam kar rahe the.` : '';
    return pickVariant(
      [
        `Main yahin hoon ${params.userName}, offline cognitive engine active hai — commands, memory aur local files sab ready hain.${topicBit} Batao kya karna hai?`,
        `Sab ready hai ${params.userName}! Main abhi background state aur tumhare workspace par nazar rakh rahi hoon.${topicBit} Kya open ya check karun?`,
        `Active hoon ${params.userName} — Hindi, Hinglish ya English kisi mein bhi command do.${topicBit}`,
      ],
      params.seed
    );
  }

  const topicClause = params.activeTopic ? ` We were just working on ${params.activeTopic}.` : '';
  return pickVariant(
    [
      `Standing by, ${params.userName}. Local Cognitive Engine is active and ready.${topicClause} What do you need?`,
      `Right here, ${params.userName} — all local brain modules, memory layers, and desktop tools are ready.${topicClause}`,
      `Ready when you are, ${params.userName}.${topicClause} Give me a command or question.`,
    ],
    params.seed
  );
}
