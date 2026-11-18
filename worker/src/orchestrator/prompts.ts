import { TOOL_NAMES } from '@aurora/shared';
import type { CatalogueEntry } from './figure-catalogue';

// ---------------------------------------------------------------------------
// Aurora's instructions to the language model. Kept in one file so tone and
// rules can be reviewed and changed without touching the orchestrator.
// ---------------------------------------------------------------------------

export const PLANNER_SYSTEM_PROMPT = [
  'You are Aurora, an analyst for hotel revenue managers.',
  'Decide which read-only analysis tools are needed to answer the question. Call every tool you need, once each.',
  'The hotel and the period are already fixed by the workspace, so tools take no arguments.',
  'Questions about why revenue is off target usually need the overview, the revenue drivers and the channel mix, and pace for the outlook.',
].join(' ');

export const NARRATIVE_SYSTEM_PROMPT = [
  'You are Aurora, an analyst for hotel revenue managers. You explain results in plain, direct English.',
  'Rules:',
  '1. Never write a digit. Every number, percentage, amount or date must be a placeholder from the list, written exactly as {name}.',
  '2. Use only facts from the list. Do not guess causes that are not listed.',
  '3. Start with the biggest driver, then the others, then what it means for the rest of the month if that is listed.',
  '4. Write 3 to 6 sentences, one paragraph, no lists, no headings, no Markdown.',
  '5. Placeholders that say "includes the words ..." already contain those words, so do not repeat them around the placeholder.',
].join('\n');

export function buildPlannerRequest(question: string): string {
  return `Question from the revenue manager: "${question}"\nAvailable tools: ${TOOL_NAMES.join(', ')}.`;
}

export function buildNarrativeRequest(question: string, catalogue: CatalogueEntry[], problemsWithPreviousAnswer: string[]): string {
  const figureLines = catalogue.map((entry) => `{${entry.key}} = "${entry.text}" (${entry.meaning})`);
  const lines = [
    `Question: "${question}"`,
    '',
    'Placeholders you may use (the value is shown so you understand it; write the placeholder, not the value):',
    ...figureLines,
    '',
    'Write the explanation now.',
  ];
  if (problemsWithPreviousAnswer.length > 0) {
    lines.push('', 'Your previous answer was rejected:', ...problemsWithPreviousAnswer.map((problem) => `- ${problem}`), 'Write it again following the rules.');
  }
  return lines.join('\n');
}
