import type { BriefingInsight, GetPropertyStatusOutput, InvestigationContext } from '@aurora/shared';
import type { ReactNode } from 'react';
import { PRIORITY_LABELS } from '../briefing/briefing-display';
import type { MorningBriefingState } from '../briefing/useMorningBriefing';

interface PropertyIntelligenceProps {
  briefingState: MorningBriefingState;
  status: GetPropertyStatusOutput;
  onInvestigate: (question: string, context?: InvestigationContext) => void;
  onShowEvidence: (insight: BriefingInsight) => void;
  renderSaveButton: (insight: BriefingInsight) => ReactNode;
}

/**
 * What deserves attention at this property, in a few lines: the morning
 * briefing's findings (the same ranking, not a second one) and what the rooms
 * say tonight. Each line can be investigated, saved to Decisions, or checked.
 */
export function PropertyIntelligence({ briefingState, status, onInvestigate, onShowEvidence, renderSaveButton }: PropertyIntelligenceProps) {
  const unsellable = status.unavailableRooms.length;

  return (
    <div className="property-intelligence">
      {unsellable > 0 && (
        <div className="intelligence-item intelligence-item--operational">
          <span className="intelligence-item__dot" aria-hidden="true" />
          <div className="intelligence-item__body">
            <span className="intelligence-item__tag">Operations</span>
            <span className="intelligence-item__title">
              {unsellable} {unsellable === 1 ? 'room cannot' : 'rooms cannot'} be sold tonight because of maintenance
            </span>
            <div className="intelligence-item__actions">
              <button type="button" className="text-button" onClick={() => onInvestigate('Did the maintenance cost us any sales?')}>
                Investigate with Aurora
              </button>
            </div>
          </div>
        </div>
      )}

      {briefingState.status === 'loading' && <span className="skeleton skeleton--line" aria-busy="true" />}
      {briefingState.status === 'failed' && <p className="property-empty">The findings could not be loaded: {briefingState.message}</p>}
      {briefingState.status === 'ready' && briefingState.briefing.insights.length === 0 && unsellable === 0 && (
        <p className="property-empty">Nothing stands out today: revenue, pace, channels and rooms are within their baselines.</p>
      )}
      {briefingState.status === 'ready' &&
        briefingState.briefing.insights.map((insight) => (
          <div key={insight.id} className={`intelligence-item intelligence-item--${insight.priority}`}>
            <span className="intelligence-item__dot" aria-hidden="true" />
            <div className="intelligence-item__body">
              <span className="intelligence-item__tag">
                {PRIORITY_LABELS[insight.priority]} · {insight.topic}
              </span>
              <span className="intelligence-item__title">{insight.title}</span>
              <div className="intelligence-item__actions">
                <button type="button" className="text-button" onClick={() => onInvestigate(insight.action.question, { ...insight.action.context, origin: 'property' })}>
                  Investigate with Aurora
                </button>
                <button type="button" className="text-button" onClick={() => onShowEvidence(insight)}>
                  View evidence
                </button>
                {renderSaveButton(insight)}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
