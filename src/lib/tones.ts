import type { Tone } from './types';

export const DEFAULT_TONE: Tone = 'normal';

// Non-normal clauses lead with an explicit override of "Preserve ... tone" so
// the model isn't given contradictory instructions from the base prompt.
const CLAUSES: Record<Tone, string> = {
  normal:
    'Keep the register of the original text; do not make it more formal or more casual.',
  polite:
    'Tone override: instead of preserving the original tone, write the translation in a polite, courteous register (for example, desu/masu form in Japanese, the formal form of address in languages that distinguish one), without changing the content.',
  business:
    'Tone override: instead of preserving the original tone, write the translation in a formal business register suitable for contracts and official documents: precise, unambiguous wording, standard formal terminology, no colloquialisms, contractions, slang, or emoji.',
  casual:
    'Tone override: instead of preserving the original tone, write the translation in a casual, everyday conversational register, the way a native speaker would say it to a friend. Natural colloquial phrasing and contractions are fine, but do not change the meaning.',
  x: "Tone override: instead of preserving the original tone, write the translation as a natural post on X (formerly Twitter) by a native speaker: concise and conversational, keeping hashtags, @mentions, URLs, and emoji as they are. Keep the whole post within X's 280-character limit where possible (X counts each Chinese, Japanese, or Korean character as two, so aim for about 140 of those), preferring shorter phrasing over dropping essential information.",
  plain:
    'Tone override: instead of preserving the original tone, use plain, simple language that junior and senior high school students can understand (roughly CEFR B1): common everyday words, short sentences, and a brief plain explanation in place of jargon or rare idioms, while keeping the meaning accurate.',
};

export const TONES: readonly { id: Tone; label: string; hint: string }[] = [
  { id: 'normal', label: 'Normal', hint: 'Keep the original register as-is.' },
  { id: 'polite', label: 'Polite', hint: 'Courteous, formal form of address.' },
  { id: 'business', label: 'Business', hint: 'Formal register for contracts and official text.' },
  { id: 'casual', label: 'Casual', hint: 'Everyday conversational register.' },
  { id: 'x', label: 'X post', hint: 'Concise, keeps hashtags/mentions, fits the 280-char limit.' },
  { id: 'plain', label: 'Plain', hint: 'Simple wording, roughly CEFR B1.' },
];

export function toneClause(tone: Tone): string {
  return CLAUSES[tone];
}
