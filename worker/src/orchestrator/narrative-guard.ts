import type { CatalogueEntry } from './figure-catalogue';
import type { NarrativeSegment } from './narrative-writer';

// ---------------------------------------------------------------------------
// The number guard. A language model can write "−12%" when the fact says
// "−9.8%". Instead of trying to catch wrong numbers afterwards, we do not let
// the model write numbers at all: every figure must be a {placeholder} from
// the catalogue. This guard rejects any answer that breaks that rule.
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERN = /\{([a-z0-9_]+)\}/gi;
const MINIMUM_FIGURES = 3;
const MINIMUM_WORDS = 25;
const MAXIMUM_WORDS = 170;

export interface GuardResult {
  isValid: boolean;
  /** Why the answer was rejected, in words the model understands (sent back on retry). */
  problems: string[];
  /** The text split into plain parts and figures, with exact values filled in. */
  segments: NarrativeSegment[];
}

/** Removes formatting the explanation area does not render (Markdown, quotes around the whole answer). */
function cleanModelText(rawText: string): string {
  return rawText
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^"(.*)"$/, '$1');
}

export function checkAndRenderNarrative(rawText: string, catalogue: CatalogueEntry[]): GuardResult {
  const text = cleanModelText(rawText);
  const entriesByKey = new Map(catalogue.map((entry) => [entry.key, entry]));
  const problems: string[] = [];

  const usedKeys = [...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]!.toLowerCase());
  const unknownKeys = [...new Set(usedKeys.filter((key) => !entriesByKey.has(key)))];
  if (unknownKeys.length > 0) {
    problems.push(`These placeholders do not exist: ${unknownKeys.map((key) => `{${key}}`).join(', ')}. Use only the listed placeholders.`);
  }

  const textWithoutPlaceholders = text.replace(PLACEHOLDER_PATTERN, '');
  const strayNumbers = textWithoutPlaceholders.match(/[^\s]*\d[^\s]*/g) ?? [];
  if (strayNumbers.length > 0) {
    problems.push(`Numbers must only appear through placeholders. Remove or replace: ${[...new Set(strayNumbers)].slice(0, 5).join(', ')}.`);
  }
  if (/[{}]/.test(textWithoutPlaceholders)) {
    problems.push('Write placeholders exactly as {name}, with no spaces or other characters inside the braces.');
  }

  const figureCount = usedKeys.filter((key) => entriesByKey.get(key)?.factId).length;
  if (figureCount < MINIMUM_FIGURES) {
    problems.push(`Use at least ${MINIMUM_FIGURES} figure placeholders, so the explanation is backed by the numbers.`);
  }

  const wordCount = textWithoutPlaceholders.split(/\s+/).filter(Boolean).length + usedKeys.length;
  if (wordCount < MINIMUM_WORDS || wordCount > MAXIMUM_WORDS) {
    problems.push(`Write between ${MINIMUM_WORDS} and ${MAXIMUM_WORDS} words (this answer has ${wordCount}).`);
  }

  if (problems.length > 0) return { isValid: false, problems, segments: [] };
  return { isValid: true, problems: [], segments: renderSegments(text, entriesByKey) };
}

/** Splits the text at each placeholder and puts the exact value in its place. */
function renderSegments(text: string, entriesByKey: Map<string, CatalogueEntry>): NarrativeSegment[] {
  const segments: NarrativeSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const entry = entriesByKey.get(match[1]!.toLowerCase())!;
    const textBefore = text.slice(lastIndex, match.index);
    if (textBefore) segments.push({ text: textBefore });
    // Dates and other context values are plain text; figures carry their fact id.
    segments.push(entry.factId ? { text: entry.text, factId: entry.factId } : { text: entry.text });
    lastIndex = match.index + match[0].length;
  }
  const textAfter = text.slice(lastIndex);
  if (textAfter) segments.push({ text: textAfter });
  return mergeAdjacentPlainText(segments);
}

function mergeAdjacentPlainText(segments: NarrativeSegment[]): NarrativeSegment[] {
  return segments.reduce<NarrativeSegment[]>((merged, segment) => {
    const previous = merged.at(-1);
    if (previous && !previous.factId && !segment.factId) {
      merged[merged.length - 1] = { text: previous.text + segment.text };
    } else {
      merged.push(segment);
    }
    return merged;
  }, []);
}
