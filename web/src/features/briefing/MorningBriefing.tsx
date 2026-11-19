import type { ReactNode } from 'react';
import { BRIEFING_SOURCES, formatPeriodLabel, type BriefingInsight, type MorningBriefing as MorningBriefingData } from '@aurora/shared';
import { ArrowRightIcon } from '../../design-system/icons';
import { joinClassNames } from '../../lib/class-names';
import {
  describeItemCount,
  describeSources,
  formatLongDate,
  formatMeasureDelta,
  formatMeasureValue,
  formatShortDate,
  greetingFor,
  PRIORITY_LABELS,
} from './briefing-display';
import type { MorningBriefingState } from './useMorningBriefing';

// ---------------------------------------------------------------------------
// The morning briefing, shown when a chat starts: the few things worth the
// manager's attention today, most urgent first. Each item is a figure from
// the data against its baseline, ranked by fixed rules (no AI writes it), and
// one action that opens the matching investigation in the chat.
// ---------------------------------------------------------------------------

interface MorningBriefingProps {
  state: MorningBriefingState;
  onRetry: () => void;
  onInvestigate: (insight: BriefingInsight) => void;
  /** The viewer's hour, for the greeting. */
  hour?: number;
  /** "Save insight" for an item. */
  renderSaveButton?: (insight: BriefingInsight) => ReactNode;
}

export function MorningBriefing({ state, onRetry, onInvestigate, hour = new Date().getHours(), renderSaveButton }: MorningBriefingProps) {
  if (state.status === 'loading') return <BriefingSkeleton />;

  if (state.status === 'failed') {
    return (
      <section className="morning-briefing" aria-label="Morning briefing">
        <div className="run-banner run-banner--error" role="alert">
          <span>The briefing could not be loaded. {state.message}</span>
          <button type="button" className="run-banner__action" onClick={onRetry}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  const { briefing } = state;
  const isUnavailable = briefing.unavailableSources.length === BRIEFING_SOURCES.length;
  const isPartial = briefing.unavailableSources.length > 0 && !isUnavailable;

  return (
    <section className="morning-briefing" aria-label="Morning briefing">
      <header className="morning-briefing__header">
        <p className="morning-briefing__eyebrow">
          {briefing.hotelName} · {formatLongDate(briefing.reportDate)}
        </p>
        <h1 className="morning-briefing__title">
          {greetingFor(hour)}.{' '}
          <span className="morning-briefing__subtitle">
            {isUnavailable
              ? 'Your data could not be read this morning.'
              : briefing.insights.length === 0
                ? 'Nothing needs your attention today.'
                : describeItemCount(briefing.insights.length)}
          </span>
        </h1>
        <BriefingFreshness briefing={briefing} />
      </header>

      {isPartial && (
        <p className="morning-briefing__notice" role="status">
          Some data could not be read ({describeSources(briefing.unavailableSources)}), so items about it may be missing.
        </p>
      )}

      {isUnavailable ? (
        <div className="morning-briefing__empty">
          <p>Aurora could not read any of the hotel's data, so there is nothing to rank yet.</p>
          <button type="button" className="run-banner__action" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : briefing.insights.length === 0 ? (
        <p className="morning-briefing__empty">
          Revenue, pace, channels and segments are all within their targets and last year’s levels. Ask anything below.
        </p>
      ) : (
        <ol className="morning-briefing__items">
          {briefing.insights.map((insight, index) => (
            <li key={insight.id} className="morning-briefing__item" style={{ animationDelay: `${index * 80}ms` }}>
              <PriorityInsightCard insight={insight} onInvestigate={onInvestigate} saveButton={renderSaveButton?.(insight)} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BriefingFreshness({ briefing }: { briefing: MorningBriefingData }) {
  const parts = [
    briefing.dataThrough ? `Results through ${formatShortDate(briefing.dataThrough)}` : null,
    briefing.bookingsSnapshotDate ? `bookings counted ${formatShortDate(briefing.bookingsSnapshotDate)}` : null,
  ].filter((part): part is string => part !== null);
  return (
    <p className="morning-briefing__freshness">
      {parts.length > 0 && <span>{parts.join(' · ')}</span>}
      <span className="morning-briefing__verified">Ranked by fixed rules from your data, not written by AI</span>
    </p>
  );
}

function PriorityInsightCard({
  insight,
  onInvestigate,
  saveButton,
}: {
  insight: BriefingInsight;
  onInvestigate: (insight: BriefingInsight) => void;
  saveButton?: ReactNode;
}) {
  const { measure } = insight;
  const titleId = `briefing-${insight.id.replace(/[^a-z0-9-]/gi, '-')}`;
  return (
    <article className={joinClassNames('priority-insight', `priority-insight--${insight.priority}`)} aria-labelledby={titleId}>
      <div className="priority-insight__tags">
        <span className="priority-insight__priority">
          <span className="priority-insight__dot" aria-hidden="true" />
          {PRIORITY_LABELS[insight.priority]}
        </span>
        <span className="priority-insight__topic">{insight.topic}</span>
      </div>

      <h2 className="priority-insight__title" id={titleId}>
        {insight.title}
      </h2>

      <p className="priority-insight__measure">
        <span className="priority-insight__value">{formatMeasureValue(measure.unit, measure.value)}</span>
        <span className="priority-insight__comparison">
          {measure.label}
          <br />
          vs {formatMeasureValue(measure.unit, measure.baseline)} {measure.baselineLabel}{' '}
          <span className="priority-insight__delta">({formatMeasureDelta(measure)})</span>
        </span>
      </p>

      <p className="priority-insight__explanation">{insight.explanation}</p>

      <footer className="priority-insight__footer">
        <span className="priority-insight__source">
          {formatPeriodLabel(insight.period)} · {insight.source}
        </span>
        <span className="priority-insight__buttons">
          {saveButton}
          <button type="button" className="priority-insight__action" onClick={() => onInvestigate(insight)}>
            {insight.action.label}
            <ArrowRightIcon size={12} />
          </button>
        </span>
      </footer>
    </article>
  );
}

function BriefingSkeleton() {
  return (
    <section className="morning-briefing" aria-label="Morning briefing" aria-busy="true">
      <header className="morning-briefing__header">
        <span className="skeleton skeleton--line skeleton--short" />
        <span className="skeleton skeleton--title" />
        <span className="visually-hidden">Preparing your morning briefing…</span>
      </header>
      <ol className="morning-briefing__items">
        {[0, 1, 2].map((index) => (
          <li key={index} className="morning-briefing__item">
            <div className="priority-insight priority-insight--skeleton" aria-hidden="true">
              <span className="skeleton skeleton--line skeleton--short" />
              <span className="skeleton skeleton--line" />
              <span className="skeleton skeleton--block" />
              <span className="skeleton skeleton--line" />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
