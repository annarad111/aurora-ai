import { useRef } from 'react';
import { CloseIcon } from '../../design-system/icons';
import type { RunState } from '../../stream/run-reducer';
import { followupsForView, viewForFact, type InsightView } from '../insights/context-followups';
import type { FactInteraction } from '../insights/fact-links';
import { BridgeExploreView } from './BridgeExploreView';
import { ChannelExploreView } from './ChannelExploreView';
import { describeView, readExploreData } from './explore-views';
import { OccupancyExploreView } from './OccupancyExploreView';
import { PaceExploreView } from './PaceExploreView';
import { useDialogFocus } from './useDialogFocus';

interface ExploreOverlayProps {
  view: InsightView;
  run: RunState;
  interaction: FactInteraction;
  onClose: () => void;
  onAskQuestion: (question: string) => void;
}

/**
 * "Explore this insight": a larger, interactive version of one chart, opened
 * from the answer. Esc, the × button or a click on the dimmed background closes it.
 */
export function ExploreOverlay({ view, run, interaction, onClose, onAskQuestion }: ExploreOverlayProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef, onClose);

  const data = readExploreData(run);
  const { title, subtitle } = describeView(view, data);
  // "Suggested next, based on X" only when X belongs to this view; the questions are about the view.
  const focusedProvenance =
    interaction.focusedFactId && viewForFact(interaction.focusedFactId) === view
      ? run.provenanceByFactId[interaction.focusedFactId]
      : undefined;

  return (
    <div className="explore-overlay">
      <div className="explore-overlay__scrim" onClick={onClose} aria-hidden="true" />
      <section ref={dialogRef} className="explore-overlay__dialog" role="dialog" aria-modal="true" aria-labelledby="explore-overlay-title">
        <header className="explore-overlay__header">
          <div className="explore-overlay__titles">
            <span className="explore-overlay__eyebrow">Explore · from Aurora's answer</span>
            <h2 id="explore-overlay-title" className="explore-overlay__title">
              {title}
            </h2>
            <p className="explore-overlay__subtitle">{subtitle}</p>
          </div>
          <button type="button" className="icon-button icon-button--large" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        {view === 'occupancy' && data.overview && <OccupancyExploreView overview={data.overview} />}
        {view === 'bridge' && data.drivers && <BridgeExploreView drivers={data.drivers} run={run} interaction={interaction} />}
        {view === 'channel' && data.channelMix && <ChannelExploreView channelMix={data.channelMix} />}
        {view === 'pace' && data.pace && <PaceExploreView pace={data.pace} roomCount={data.overview?.hotel.roomCount ?? null} />}

        <footer className="explore-overlay__footer">
          <span className="follow-ups__label">
            {focusedProvenance ? `Suggested next, based on ${focusedProvenance.contextLabel}` : 'Suggested next'}
          </span>
          <div className="follow-ups__list">
            {followupsForView(view).map((question) => (
              <button key={question} type="button" className="follow-up" onClick={() => onAskQuestion(question)}>
                {question}
              </button>
            ))}
          </div>
        </footer>
      </section>
    </div>
  );
}
