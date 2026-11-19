import { TRAIL_STAGES, type TrailAction, type TrailStage, type TrailStageName } from '@aurora/shared';
import { ArrowRightIcon } from '../../design-system/icons';
import { joinClassNames } from '../../lib/class-names';
import type { RunState } from '../../stream/run-reducer';
import type { InsightView } from '../explore/explore-views';
import type { FactInteraction } from '../insights/fact-links';

// ---------------------------------------------------------------------------
// The Aurora insight trail: how Aurora got from the question to the answer,
// in four steps anyone in the hotel understands. No function names, no
// formulas. Each step lights up as Aurora gets there, like a path being lit.
//
// While Aurora works, the steps are dim and the current one glows, with a
// plain sentence of what is happening. When the tools are done, each step
// gets its sentence, and the last one offers what to do next.
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

interface InsightTrailProps {
  run: RunState;
  interaction: FactInteraction;
  /** True when the answer has the data an Explore view needs (pace for the what-if). */
  canOpenView: (view: InsightView) => boolean;
  onAskQuestion: (question: string) => void;
  onOpenExplore: (view: InsightView) => void;
}

/** How many of the four steps are lit while the tools run: the share of finished steps, at most three. */
function countLitStagesWhileWorking(run: RunState): number {
  if (run.steps.length === 0) return 0;
  const finished = run.steps.filter((step) => step.status === 'done').length;
  return Math.min(3, Math.floor((finished / run.steps.length) * 3));
}

function describeActivity(run: RunState): string {
  const runningStep = run.steps.find((step) => step.status === 'running');
  if (runningStep) return `${runningStep.label}…`;
  if (run.steps.length > 0 && run.steps.every((step) => step.status === 'done')) return 'Putting it into words…';
  return 'Reading your question…';
}

export function InsightTrail({ run, interaction, canOpenView, onAskQuestion, onOpenExplore }: InsightTrailProps) {
  const isWorking = run.phase === 'streaming' && run.trail === null;
  // An analysis stopped or failed before it finished: nothing to show beyond the banner.
  if (!isWorking && run.trail === null) return null;

  const stagesByName = new Map((run.trail ?? []).map((stage) => [stage.stage, stage]));
  const visibleStages = run.trail ? TRAIL_STAGES.filter((name) => stagesByName.has(name)) : TRAIL_STAGES;
  const litCount = isWorking ? countLitStagesWhileWorking(run) : visibleStages.length;

  function runAction(action: TrailAction) {
    if (action.kind === 'ask') onAskQuestion(action.question);
    else onOpenExplore(action.view);
  }

  return (
    <section className={joinClassNames('insight-trail', isWorking && 'insight-trail--working')} aria-label="Aurora insight trail">
      <header className="insight-trail__header">
        <span className="insight-trail__eyebrow">
          <SparkIcon />
          Aurora insight trail
        </span>
        <span className="insight-trail__title">{isWorking ? describeActivity(run) : 'From question to clarity.'}</span>
      </header>

      <ol className="insight-trail__stages">
        {visibleStages.map((name, index) => {
          const stage: TrailStage | undefined = stagesByName.get(name);
          const isLit = index < litCount;
          const isCurrent = isWorking && index === litCount;
          const action = stage?.action && (stage.action.kind === 'ask' || canOpenView(stage.action.view)) ? stage.action : undefined;
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
              style={{ animationDelay: `${index * 140}ms` }}
            >
              <span className="insight-trail__light" aria-hidden="true" />
              <div className="insight-trail__body">
                <span className="insight-trail__label">
                  <span className="insight-trail__number">{String(index + 1).padStart(2, '0')}</span>
                  {STAGE_LABELS[name]}
                </span>
                {stage ? (
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
                      {stage.text}
                    </button>
                  ) : (
                    <span className="insight-trail__text">{stage.text}</span>
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
