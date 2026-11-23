export interface NoteItem {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'normal' | 'high';
  dueDate?: string;
  createdAt: string;
}

export interface ReminderItem {
  id: string;
  title: string;
  triggerDate: string; // YYYY-MM-DD
  triggerTime: string; // HH:MM
  completed: boolean;
  createdAt: string;
}

export interface ParsedProductivityAction {
  kind: 'note_add' | 'todo_add' | 'reminder_add' | 'alarm_set' | 'list_notes' | 'list_todos' | 'summarize' | 'read_aloud';
  title: string;
  detail?: string;
  date?: string;
  time?: string;
  hour?: number;
  minute?: number;
}

function getRelativeIsoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function parseTimeExpression(raw: string): { time: string; hour: number; minute: number } | null {
  const m = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return {
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    hour,
    minute,
  };
}

export function parseProductivityCommand(rawCommand: string): ParsedProductivityAction | null {
  const trimmed = rawCommand
    .trim()
    .replace(/^(?:hey\s+friday[,\s]+|friday[,\s]+)?(?:please\s+)?/i, '')
    .trim();

  // Alarm request
  const alarmMatch = trimmed.match(/^(?:set|create|add)\s+(?:an\s+)?alarm\s+(?:for|at)\s+(.+)$/i);
  if (alarmMatch) {
    const parsedTime = parseTimeExpression(alarmMatch[1]) ?? { time: '07:00', hour: 7, minute: 0 };
    return {
      kind: 'alarm_set',
      title: `F.R.I.D.A.Y. Alarm (${parsedTime.time})`,
      time: parsedTime.time,
      hour: parsedTime.hour,
      minute: parsedTime.minute,
    };
  }

  // Reminder request ("remind me to study tomorrow at 5pm" / "remind me to drink water")
  const remindMatch = trimmed.match(/^remind\s+me\s+(?:to\s+)?(.+)$/i);
  if (remindMatch) {
    const body = remindMatch[1].trim();
    const isTomorrow = /\btomorrow\b/i.test(body);
    const parsedTime = parseTimeExpression(body) ?? { time: '09:00', hour: 9, minute: 0 };
    const cleanTitle = body
      .replace(/\b(today|tomorrow)\b/gi, '')
      .replace(/\b(at|for)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || body;

    return {
      kind: 'reminder_add',
      title: cleanTitle,
      date: getRelativeIsoDate(isTomorrow ? 1 : 0),
      time: parsedTime.time,
      hour: parsedTime.hour,
      minute: parsedTime.minute,
    };
  }

  // Note listing / addition
  if (/^(?:show|list|read|open)\s+(?:my\s+)?notes$/i.test(trimmed)) {
    return { kind: 'list_notes', title: 'Notes' };
  }

  const noteAdd = trimmed.match(/^(?:take\s+a\s+note|save\s+(?:a\s+)?note|add\s+note|note\s+that|note:)[\s:-]*(.+)$/i);
  if (noteAdd && noteAdd[1].trim()) {
    const content = noteAdd[1].trim();
    const title = content.split(/[.!?\n]/)[0].slice(0, 48).trim() || 'Quick Note';
    return {
      kind: 'note_add',
      title,
      detail: content,
    };
  }

  // Todo listing / addition
  if (/^(?:show|list|check)\s+(?:my\s+)?(?:to-?do|tasks|todo\s+list)$/i.test(trimmed)) {
    return { kind: 'list_todos', title: 'To-Do List' };
  }

  const todoAdd = trimmed.match(
    /^(?:add\s+(?:to\s+(?:my\s+)?(?:to-?do|tasks)|task)|create\s+task|todo:)[\s:-]*(.+)$/i
  );
  if (todoAdd && todoAdd[1].trim()) {
    return {
      kind: 'todo_add',
      title: todoAdd[1].trim(),
    };
  }

  // Extractive text summarizer ("summarize text: ...")
  const summarizeTextMatch = trimmed.match(/^summarize(?:\s+this\s+text|\s+text)?[\s:]+([\s\S]{30,})$/i);
  if (summarizeTextMatch && !/https?:\/\//i.test(summarizeTextMatch[1])) {
    return {
      kind: 'summarize',
      title: 'Text Summary',
      detail: summarizeTextMatch[1].trim(),
    };
  }

  // Read aloud ("read aloud: ..." or "read this aloud: ...")
  const readMatch = trimmed.match(/^read(?:\s+this)?\s+aloud[\s:]+(.+)$/i);
  if (readMatch && readMatch[1].trim()) {
    return {
      kind: 'read_aloud',
      title: 'Read Aloud',
      detail: readMatch[1].trim(),
    };
  }

  return null;
}

export function summarizeTextExtractive(rawText: string, maxSentences = 3): string {
  const clean = rawText.replace(/\s+/g, ' ').trim();
  if (!clean) return 'No text content provided to summarize.';
  const sentences = clean.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  if (sentences.length <= maxSentences) {
    return sentences.join(' ');
  }

  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'that', 'this', 'it', 'as', 'are', 'was', 'be',
  ]);
  const wordFreq = new Map<string, number>();
  for (const word of clean.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)) {
    if (word.length > 2 && !stopWords.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
    }
  }

  const scored = sentences.map((sentence, idx) => {
    const tokens = sentence.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const freqScore = tokens.reduce((sum, tok) => sum + (wordFreq.get(tok) ?? 0), 0);
    const positionBoost = idx === 0 ? 1.35 : idx === sentences.length - 1 ? 1.1 : 1.0;
    return { idx, sentence, score: (freqScore / Math.max(1, tokens.length)) * positionBoost };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.idx - b.idx);

  return top.map((item) => item.sentence).join(' ');
}
