import type { ReactNode } from 'react';
import type { RunState } from '../../stream/run-reducer';
import { isViewAvailable, readExploreData, type InsightView } from '../explore/explore-views';
import { ContextualInsightCard } from '../insights/ContextualInsightCard';
import { actionsForSelection, describeInvestigationOrigin, type InvestigationAction } from '../investigation/investigation-actions';
import type { FactInteraction } from '../insights/fact-links';
import { KpiGrid } from '../insights/KpiCard';
import { MainFinding } from '../insights/MainFinding';
import { FollowUps } from './FollowUps';
import { RunBanner } from './RunBanner';
import { InsightTrail } from './InsightTrail';
import { StreamedExplanation } from './StreamedExplanation';

interface AnswerViewProps {
  run: RunState;
  /** Opened from history: shown as it was, without streaming. */
  isRestored: boolean;
  /** Only the latest answer offers Retry. */
  isLatest: boolean;
  interaction: FactInteraction;
  onAskQuestion: (question: string) => void;
  onRetry: () => void;
  onShowProvenance: (factId: string) => void;
  onClearFocus: () => void;
  onOpenExplore: (view: InsightView) => void;
  onOpenDecisions: () => void;
  /** An investigation action of a selected KPI. */
  onAction: (action: InvestigationAction) => void;
  /** "Save insight" for this answer, shown in the main finding. */
  saveButton?: ReactNode;
}

/**
 * One answer, top to bottom, in the order of the design. Each block appears
 * as soon as its data has arrived.
 */
export function AnswerView({
  run,
  isRestored,
  isLatest,
  interaction,
  onAskQuestion,
  onRetry,
  onShowProvenance,
  onClearFocus,
  onOpenExplore,
  onOpenDecisions,
  onAction,
  saveButton,
}: AnswerViewProps) {
  const focusedProvenance = interaction.focusedFactId ? run.provenanceByFactId[interaction.focusedFactId] : undefined;
  // Follow-ups and the Explore view of the selected figure come with its provenance, written by the server from the data.
  const followups = focusedProvenance ? focusedProvenance.followupQuestions : run.followups;
  const focusedView = focusedProvenance ? focusedProvenance.exploreView : null;
  const canExploreFocusedFact = focusedView !== null && isViewAvailable(focusedView, readExploreData(run));
  // A selected KPI card gets questions to investigate it, with the KPI as context.
  const focusedKpi = run.phase === 'done' ? run.kpis.find((kpi) => kpi.factId === interaction.focusedFactId) : undefined;
  const kpiActions = focusedKpi
    ? actionsForSelection(
        {
          kind: 'kpi',
          metric: focusedKpi.metric,
          factId: focusedKpi.factId,
          label: focusedKpi.label,
          actual: focusedKpi.actual,
          reference: focusedKpi.reference,
          referenceKind: focusedKpi.referenceKind,
          period: readExploreData(run).overview?.period ?? null,
        },
        { hasEvidenceFor: (factId) => factId in run.provenanceByFactId, canOpenView: () => false },
      )
    : [];
  // A greeting or a reply outside the hotel's business has no steps, figures or charts: just words and suggestions.
  const isConversationReply = run.completion?.answerKind === 'conversation' || (run.steps.length === 0 && run.explanation.length > 0);

  return (
    <>
      <div className="user-question">
        {run.investigation && <p className="user-question__context">{describeInvestigationOrigin(run.investigation)}</p>}
        {run.completion?.followUpOf && (
          <p className="user-question__context">
            Follow-up to “{run.completion.followUpOf}”
          </p>
        )}
        <p className="user-question__bubble">{run.question}</p>
      </div>

      <div className="assistant-message">
        <span className="assistant-message__avatar" aria-hidden="true">
          <img src="/aurora-mark.png" alt="" />
        </span>
        <div className="assistant-message__content">
      {!isConversationReply && (
        <InsightTrail
          run={run}
          isRestored={isRestored}
          interaction={interaction}
          canOpenView={(view) => isViewAvailable(view, readExploreData(run))}
          onAskQuestion={onAskQuestion}
          onOpenExplore={onOpenExplore}
          onOpenDecisions={onOpenDecisions}
        />
      )}

      {run.insight && (
        <MainFinding
          insight={run.insight}
          interaction={interaction}
          onShowCalculation={() => onShowProvenance(run.insight?.factIds[0] ?? 'revenue_gap')}
          saveButton={saveButton}
        />
      )}

      {run.kpis.length > 0 && <KpiGrid kpis={run.kpis} interaction={interaction} />}

      {run.explanation.length > 0 && (
        <StreamedExplanation segments={run.explanation} isStreaming={run.phase === 'streaming' && !isRestored} interaction={interaction} />
      )}

      {focusedProvenance && (
        <ContextualInsightCard
          key={focusedProvenance.factId}
          provenance={focusedProvenance}
          onExplore={canExploreFocusedFact && focusedView ? () => onOpenExplore(focusedView) : null}
          onShowProvenance={() => onShowProvenance(focusedProvenance.factId)}
          onDismiss={onClearFocus}
          investigationActions={kpiActions}
          onAction={onAction}
        />
      )}

      <RunBanner phase={run.phase} error={run.error} onRetry={isLatest ? onRetry : null} />

      {run.phase === 'done' && followups.length > 0 && (
        <FollowUps
          questions={followups}
          basedOnLabel={focusedProvenance?.contextLabel ?? null}
          completion={isConversationReply ? null : run.completion}
          label={isConversationReply ? 'You could ask' : undefined}
          onAskQuestion={onAskQuestion}
        />
      )}
        </div>
      </div>
    </>
  );
}
