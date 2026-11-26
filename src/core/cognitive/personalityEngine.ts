import type { CognitiveLanguage, ResponseStyle, UserPreferenceProfile } from './types';

export function selectResponseStyle(params: {
  detectedLanguage: CognitiveLanguage;
  userPreference?: UserPreferenceProfile;
  isFailure?: boolean;
  isClarification?: boolean;
  isHindiSimplify?: boolean;
  isInformative?: boolean;
}): ResponseStyle {
  if (params.isFailure) return 'failure';
  if (params.isClarification) return 'clarification';
  if (params.isHindiSimplify || params.userPreference?.preferredStyle === 'hindi_simple') {
    return 'hindi_simple';
  }
  if (
    params.detectedLanguage === 'hinglish' ||
    params.detectedLanguage === 'hindi' ||
    params.detectedLanguage === 'mixed' ||
    params.userPreference?.preferredStyle === 'hinglish'
  ) {
    return 'hinglish';
  }
  if (params.isInformative) return 'informative';
  return 'casual';
}

export function adaptToneAndVoiceFriendliness(text: string, concise = false): string {
  // Strip stiff robotic openers if any slip in
  let out = text
    .replace(/^(?:certainly\.?|of course\.?|sure thing\.?|absolutely\.?)\s+/i, '')
    .trim();

  if (concise && out.length > 340) {
    const sentences = out.split(/(?<=[.!?])\s+/);
    out = sentences.slice(0, 2).join(' ').trim();
  }
  return out;
}

export function pickVariant(variants: string[], seedInput: string): string {
  if (variants.length === 0) return '';
  let hash = 0;
  for (let i = 0; i < seedInput.length; i += 1) {
    hash = (hash * 31 + seedInput.charCodeAt(i)) >>> 0;
  }
  return variants[hash % variants.length];
}
