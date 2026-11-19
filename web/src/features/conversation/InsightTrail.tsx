import { TRAIL_STAGES, type TrailAction, type TrailStage, type TrailStageName } from '@aurora/shared';
import { useEffect, useState } from 'react';
import { ArrowRightIcon } from '../../design-system/icons';
import { joinClassNames } from '../../lib/class-names';
import type { RunState } from '../../stream/run-reducer';
import type { InsightView } from '../explore/explore-views';
import type { FactInteraction } from '../insights/fact-links';

// ---------------------------------------------------------------------------
// The Aurora insight trail: how Aurora got from the question to the answer,
// in four steps anyone in the hotel understands. No function names, no
// formulas.
//
// While Aurora works, the steps wait as dim placeholders and the first one
// breathes, with a plain sentence of what is happening. When the steps
// arrive, they light up one after another, like the answer streaming in:
// the light comes on, the line grows to the next step, the words fade in.
// An answer opened from history, or a reader who prefers reduced motion,
// sees every step at once.
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<TrailStageName, string> = {
  observation: 'Observation',
  discovery: 'Discovery',
  understanding: 'Understanding',
  decision: 'Decision',
};

/** What each step means, shown while Aurora is still working on it. */
const STAGE_PLACEHOLDERS: Record<TrailStageName, string> = {
  observation: 'What happened',
  discovery: 'What caused it',
  understanding: 'Why it matters',
  decision: 'What to do next',
};

/** Time between two steps lighting up. Long enough to read the step that just appeared. */
export const STAGE_REVEAL_INTERVAL_MS = 700;
/** The first step follows the arrival of the trail almost at once. */
const FIRST_STAGE_DELAY_MS = 120;
/** Words of a step fade in this far apart, up to a cap, so long sentences do not drag. */
const WORD_DELAY_MS = 28;
const MAXIMUM_WORD_DELAY_MS = 450;

interface InsightTrailProps {
  run: RunState;
  interaction: FactInteraction;
  /** Opened from history: every step is shown at once, without animation. */
  isRestored: boolean;
  /** True when the answer has the data an Explore view needs (pace for the what-if). */
  canOpenView: (view: InsightView) => boolean;
  onAskQuestion: (question: string) => void;
  onOpenExplore: (view: InsightView) => void;
  /** "Open Decisions" in an answer about the saved decisions. */
  onOpenDecisions: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * How many steps are lit. Counts up one step at a time once the trail has
 * arrived; starts full for a restored answer or with reduced motion.
 */
export function useRevealedStageCount(stageCount: number, shouldAnimate: boolean): number {
  const [revealedCount, setRevealedCount] = useState(() => (shouldAnimate ? 0 : stageCount));

  useEffect(() => {
    if (!shouldAnimate) {
      setRevealedCount(stageCount);
      return;
    }
    if (revealedCount >= stageCount) return;
    const timer = window.setTimeout(() => setRevealedCount((count) => count + 1), revealedCount === 0 ? FIRST_STAGE_DELAY_MS : STAGE_REVEAL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [stageCount, shouldAnimate, revealedCount]);

  return Math.min(revealedCount, stageCount);
}

function describeActivity(run: RunState): string {
  const runningStep = run.steps.find((step) => step.status === 'running');
  if (runningStep) return `${runningStep.label}…`;
  if (run.steps.length > 0 && run.steps.every((step) => step.status === 'done')) return 'Putting it into words…';
  return 'Reading your question…';
}

/** A sentence whose words fade in one after another, like streamed text. */
function RevealedWords({ text, isAnimated }: { text: string; isAnimated: boolean }) {
  if (!isAnimated) return <>{text}</>;
  const words = text.split(/(\s+)/);
  let wordIndex = 0;
  return (
    <>
      {/* Screen readers get the sentence once, not word by word. */}
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {words.map((part, index) => {
          if (/^\s+$/.test(part)) return part;
          const delay = Math.min(wordIndex++ * WORD_DELAY_MS, MAXIMUM_WORD_DELAY_MS);
          return (
            <span key={index} className="insight-trail__word" style={{ animationDelay: `${delay}ms` }}>
              {part}
            </span>
          );
        })}
      </span>
    </>
  );
}

export function InsightTrail({ run, interaction, isRestored, canOpenView, onAskQuestion, onOpenExplore, onOpenDecisions }: InsightTrailProps) {
  const isWorking = run.phase === 'streaming' && run.trail === null;
  const stagesByName = new Map((run.trail ?? []).map((stage) => [stage.stage, stage]));
  const visibleStages = run.trail ? TRAIL_STAGES.filter((name) => stagesByName.has(name)) : TRAIL_STAGES;
  // Decided once per answer: a live answer animates, one opened from history does not.
  const [shouldAnimate] = useState(() => !isRestored && !prefersReducedMotion());
  const revealedCount = useRevealedStageCount(run.trail ? visibleStages.length : 0, shouldAnimate);

  // An analysis stopped or failed before it finished: nothing to show beyond the banner.
  if (!isWorking && run.trail === null) return null;

  const isRevealing = run.trail !== null && revealedCount < visibleStages.length;

  function runAction(action: TrailAction) {
    if (action.kind === 'ask') onAskQuestion(action.question);
    else if (action.kind === 'explore') onOpenExplore(action.view);
    else onOpenDecisions();
  }

  return (
    <section
      className={joinClassNames('insight-trail', isWorking && 'insight-trail--working', shouldAnimate && 'insight-trail--animated')}
      aria-label="Aurora insight trail"
      aria-busy={isWorking || isRevealing}
    >
      <header className="insight-trail__header">
        <span className="insight-trail__eyebrow">
          <SparkIcon />
          Aurora insight trail
        </span>
        <span className="insight-trail__title" aria-live="polite">
          {isWorking ? describeActivity(run) : 'From question to clarity.'}
        </span>
      </header>

      <ol className="insight-trail__stages">
        {visibleStages.map((name, index) => {
          const stage: TrailStage | undefined = stagesByName.get(name);
          const isLit = run.trail !== null && index < revealedCount;
          // While Aurora works, the first step waits for it; then each step in turn is next.
          const isCurrent = isWorking ? index === 0 : isRevealing && index === revealedCount;
          const action = isLit && stage?.action && (stage.action.kind !== 'explore' || canOpenView(stage.action.view)) ? stage.action : undefined;
          const isActiveFact = Boolean(stage?.factId && interaction.activeFactId === stage.factId);
          return (
            <li
              key={name}
              className={joinClassNames(
                'insight-trail__stage',
                `insight-trail__stage--${name}`,
                isLit && 'insight-trail__stage--lit',
                isCurrent && 'insight-trail__stage--current',
              )}
            >
              <span className="insight-trail__light" aria-hidden="true" />
              <div className="insight-trail__body">
                <span className="insight-trail__label">
                  <span className="insight-trail__number">{String(index + 1).padStart(2, '0')}</span>
                  {STAGE_LABELS[name]}
                </span>
                {stage && isLit ? (
                  stage.factId ? (
                    <button
                      type="button"
                      className={joinClassNames('insight-trail__text', 'insight-trail__text--linked', isActiveFact && 'insight-trail__text--active')}
                      onMouseEnter={() => interaction.hoverFact(stage.factId ?? null)}
                      onMouseLeave={() => interaction.hoverFact(null)}
                      onFocus={() => interaction.hoverFact(stage.factId ?? null)}
                      onBlur={() => interaction.hoverFact(null)}
                      onClick={() => stage.factId && interaction.focusFact(stage.factId)}
                    >
                      <RevealedWords text={stage.text} isAnimated={shouldAnimate} />
                    </button>
                  ) : (
                    <span className="insight-trail__text">
                      <RevealedWords text={stage.text} isAnimated={shouldAnimate} />
                    </span>
                  )
                ) : (
                  <span className="insight-trail__text insight-trail__text--placeholder">{STAGE_PLACEHOLDERS[name]}</span>
                )}
                {action && (
                  <button type="button" className="insight-trail__action" onClick={() => runAction(action)}>
                    {action.label}
                    <ArrowRightIcon size={12} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
