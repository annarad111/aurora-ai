import type { RunState } from '../../stream/run-reducer';
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
}

/**
 * One answer, top to bottom, in the order of the design. Each block appears
 * as soon as its data has arrived.
 */
export function AnswerView({ run, interaction, onAskQuestion, onRetry }: AnswerViewProps) {
  return (
    <>
      <div className="user-question">
        <p className="user-question__bubble">{run.question}</p>
      </div>

      <RunTimeline steps={run.steps} phase={run.phase} completion={run.completion} />

      {run.insight && <MainFinding insight={run.insight} interaction={interaction} />}

      {run.kpis.length > 0 && <KpiGrid kpis={run.kpis} interaction={interaction} />}

      {run.explanation.length > 0 && (
        <StreamedExplanation segments={run.explanation} isStreaming={run.phase === 'streaming'} interaction={interaction} />
      )}

      <RunBanner phase={run.phase} error={run.error} onRetry={onRetry} />

      {run.phase === 'done' && run.followups.length > 0 && (
        <FollowUps questions={run.followups} completion={run.completion} onAskQuestion={onAskQuestion} />
      )}
    </>
  );
}
