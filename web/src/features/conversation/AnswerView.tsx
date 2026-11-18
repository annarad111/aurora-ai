import type { RunState } from '../../stream/run-reducer';
import { followupsForFact } from '../insights/context-followups';
import { ContextualInsightCard } from '../insights/ContextualInsightCard';
import type { FactInteraction } from '../insights/fact-links';
import { KpiGrid } from '../insights/KpiCard';
import { MainFinding } from '../insights/MainFinding';
import { FollowUps } from './FollowUps';
import { RunBanner } from './RunBanner';
import { RunTimeline } from './RunTimeline';
import { StreamedExplanation } from './StreamedExplanation';

interface AnswerViewProps {
  run: RunState;
  interaction: FactInteraction;
  onAskQuestion: (question: string) => void;
  onRetry: () => void;
  onShowProvenance: (factId: string) => void;
  onClearFocus: () => void;
}

/**
 * One answer, top to bottom, in the order of the design. Each block appears
 * as soon as its data has arrived.
 */
export function AnswerView({ run, interaction, onAskQuestion, onRetry, onShowProvenance, onClearFocus }: AnswerViewProps) {
  const focusedProvenance = interaction.focusedFactId ? run.provenanceByFactId[interaction.focusedFactId] : undefined;
  const followups = focusedProvenance ? followupsForFact(focusedProvenance.factId) : run.followups;

  return (
    <>
      <div className="user-question">
        <p className="user-question__bubble">{run.question}</p>
      </div>

      <RunTimeline steps={run.steps} phase={run.phase} completion={run.completion} />

      {run.insight && (
        <MainFinding insight={run.insight} interaction={interaction} onShowCalculation={() => onShowProvenance('revenue_gap')} />
      )}

      {run.kpis.length > 0 && <KpiGrid kpis={run.kpis} interaction={interaction} />}

      {run.explanation.length > 0 && (
        <StreamedExplanation segments={run.explanation} isStreaming={run.phase === 'streaming'} interaction={interaction} />
      )}

      {focusedProvenance && (
        <ContextualInsightCard
          key={focusedProvenance.factId}
          provenance={focusedProvenance}
          onShowProvenance={() => onShowProvenance(focusedProvenance.factId)}
          onDismiss={onClearFocus}
        />
      )}

      <RunBanner phase={run.phase} error={run.error} onRetry={onRetry} />

      {run.phase === 'done' && followups.length > 0 && (
        <FollowUps
          questions={followups}
          basedOnLabel={focusedProvenance?.contextLabel ?? null}
          completion={run.completion}
          onAskQuestion={onAskQuestion}
        />
      )}
    </>
  );
}
