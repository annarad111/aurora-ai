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

  // Linked highlighting: what the pointer is over, and what the user clicked.
  const [hoveredFactId, setHoveredFactId] = useState<string | null>(null);
  const [focusedFactId, setFocusedFactId] = useState<string | null>(null);

  const factInteraction = useMemo<FactInteraction>(
    () => ({
      activeFactId: hoveredFactId ?? focusedFactId,
      focusedFactId,
      hoverFact: setHoveredFactId,
      // Clicking the selected fact again clears the selection.
      focusFact: (factId) => setFocusedFactId((currentFactId) => (currentFactId === factId ? null : factId)),
    }),
    [hoveredFactId, focusedFactId],
  );

  const clearSelection = useCallback(() => {
    setHoveredFactId(null);
    setFocusedFactId(null);
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
              <AnswerView run={run} interaction={factInteraction} onAskQuestion={handleAskQuestion} onRetry={insightRun.retry} />
            )}
          </div>
        </div>
        <Composer isStreaming={run.phase === 'streaming'} onAskQuestion={handleAskQuestion} onStop={insightRun.stop} />
      </main>

      <EvidencePanel />
    </div>
  );
}
