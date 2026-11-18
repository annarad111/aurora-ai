import { useCallback, useMemo, useRef, useState } from 'react';
import { AnswerView } from '../features/conversation/AnswerView';
import { Composer } from '../features/conversation/Composer';
import { SuggestedQuestions } from '../features/empty-state/SuggestedQuestions';
import type { FactInteraction } from '../features/insights/fact-links';
import { useInsightRun } from '../stream/useInsightRun';
import { ConversationHeader } from './layout/ConversationHeader';
import { EvidencePanel } from './layout/EvidencePanel';
import { Sidebar } from './layout/Sidebar';
import { CURRENT_PROPERTY } from './workspace-content';

export function App() {
  const insightRun = useInsightRun(CURRENT_PROPERTY.hotelId);
  const { state: run } = insightRun;
  const conversationBody = useRef<HTMLDivElement>(null);

  // Three kinds of selection, as in the design:
  //   hovered     what the pointer is over (temporary highlight)
  //   focused     the figure the user clicked (contextual card + follow-ups)
  //   provenance  the figure whose calculation is open in the evidence panel
  const [hoveredFactId, setHoveredFactId] = useState<string | null>(null);
  const [focusedFactId, setFocusedFactId] = useState<string | null>(null);
  const [provenanceFactId, setProvenanceFactId] = useState<string | null>(null);

  const factInteraction = useMemo<FactInteraction>(
    () => ({
      activeFactId: hoveredFactId ?? focusedFactId,
      focusedFactId,
      hoverFact: setHoveredFactId,
      focusFact: (factId) => {
        // Selecting a figure shows the charts again, so its bar can light up.
        setProvenanceFactId(null);
        // Clicking the selected figure again clears the selection.
        setFocusedFactId((currentFactId) => (currentFactId === factId ? null : factId));
      },
    }),
    [hoveredFactId, focusedFactId],
  );

  const clearSelection = useCallback(() => {
    setHoveredFactId(null);
    setFocusedFactId(null);
    setProvenanceFactId(null);
  }, []);

  const handleAskQuestion = useCallback(
    (question: string) => {
      clearSelection();
      insightRun.start(question);
      conversationBody.current?.scrollTo({ top: 0 });
    },
    [clearSelection, insightRun],
  );

  const handleStartNewAnalysis = useCallback(() => {
    clearSelection();
    insightRun.reset();
  }, [clearSelection, insightRun]);

  const openProvenance = provenanceFactId ? (run.provenanceByFactId[provenanceFactId] ?? null) : null;

  return (
    <div className="workspace">
      <Sidebar onStartNewAnalysis={handleStartNewAnalysis} onAskQuestion={handleAskQuestion} />

      <main className="workspace__conversation" aria-label="Conversation">
        <ConversationHeader runPhase={run.phase} />
        <div className="conversation-body" ref={conversationBody}>
          <div className="conversation-body__content">
            {run.phase === 'idle' ? (
              <SuggestedQuestions onAskQuestion={handleAskQuestion} />
            ) : (
              <AnswerView
                run={run}
                interaction={factInteraction}
                onAskQuestion={handleAskQuestion}
                onRetry={insightRun.retry}
                onShowProvenance={setProvenanceFactId}
                onClearFocus={() => setFocusedFactId(null)}
              />
            )}
          </div>
        </div>
        <Composer isStreaming={run.phase === 'streaming'} onAskQuestion={handleAskQuestion} onStop={insightRun.stop} />
      </main>

      <EvidencePanel
        run={run}
        interaction={factInteraction}
        openProvenance={openProvenance}
        onShowProvenance={setProvenanceFactId}
        onCloseProvenance={() => setProvenanceFactId(null)}
      />
    </div>
  );
}
