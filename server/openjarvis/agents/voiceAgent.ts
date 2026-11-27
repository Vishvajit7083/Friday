import { BaseAgent } from './baseAgent.ts';
import type { OpenJarvisAgentId, AgentContext, AgentPlanStep } from '../types.ts';
import { normalizeUnicodeAndDevanagari } from '../../../src/core/cognitive/hinglishNlp.ts';

export class VoiceAgent extends BaseAgent {
  readonly id: OpenJarvisAgentId = 'voice';
  readonly name = 'OpenJarvis Voice Agent';
  readonly description = 'Coordinates voice pipeline, multi-state audio machine, wake-word triggering, Hinglish normalization, and barge-in.';
  readonly capabilities = [
    'wake_word_detection',
    'hinglish_nlp_normalization',
    'barge_in_suppression',
    'speech_recognition_guard',
    'audio_state_machine',
  ];

  async plan(context: AgentContext): Promise<AgentPlanStep[]> {
    const steps: AgentPlanStep[] = [];
    const normalized = normalizeUnicodeAndDevanagari(context.command);

    steps.push({
      id: 'step-voice-1',
      agentId: this.id,
      title: `Normalize voice transcription (${context.command !== normalized ? 'Hinglish mapped' : 'Standard English'})`,
      parameters: { rawTranscript: context.command, normalized },
    });

    return steps;
  }
}
