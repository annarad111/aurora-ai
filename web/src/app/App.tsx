import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnswerView } from '../features/conversation/AnswerView';
import { Composer } from '../features/conversation/Composer';
import { SuggestedQuestions } from '../features/empty-state/SuggestedQuestions';
import { ExploreOverlay } from '../features/explore/ExploreOverlay';
import type { InsightView } from '../features/explore/explore-views';
import type { FactInteraction } from '../features/insights/fact-links';
import { useInsightRun } from '../stream/useInsightRun';
import { ConversationHeader } from './layout/ConversationHeader';
import { EvidencePanel } from './layout/EvidencePanel';
import { Sidebar } from './layout/Sidebar';
import { useWorkspace } from './useWorkspace';

export function App() {
  // The hotel, period and questions all come from the database through /api/workspace.
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const { state: workspaceState, reload: reloadWorkspace } = useWorkspace(selectedHotelId);
  const workspace = workspaceState.status === 'ready' ? workspaceState.workspace : null;

  const insightRun = useInsightRun(workspace?.hotel.id ?? null);
  const { state: run } = insightRun;

  // A finished answer adds its question to "Recent", so refresh the workspace then.
  useEffect(() => {
    if (run.phase === 'done' || run.phase === 'cancelled' || run.phase === 'error') reloadWorkspace();
  }, [run.phase, reloadWorkspace]);
  const conversationBody = useRef<HTMLDivElement>(null);

  // Three kinds of selection, as in the design:
  //   hovered     what the pointer is over (temporary highlight)
  //   focused     the figure the user clicked (contextual card + follow-ups)
  //   provenance  the figure whose calculation is open in the evidence panel
  const [hoveredFactId, setHoveredFactId] = useState<string | null>(null);
  const [focusedFactId, setFocusedFactId] = useState<string | null>(null);
  const [provenanceFactId, setProvenanceFactId] = useState<string | null>(null);
  // The open Explore overlay, if any.
  const [exploreView, setExploreView] = useState<InsightView | null>(null);
  // Stable, so the dialog's keyboard handling is not reset on every hover.
  const closeExplore = useCallback(() => setExploreView(null), []);

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
    setExploreView(null);
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

  const handleSelectHotel = useCallback(
    (hotelId: string) => {
      handleStartNewAnalysis();
      setSelectedHotelId(hotelId);
    },
    [handleStartNewAnalysis],
  );

  const openProvenance = provenanceFactId ? (run.provenanceByFactId[provenanceFactId] ?? null) : null;

  return (
    <div className="workspace">
      <Sidebar
        workspace={workspace}
        onStartNewAnalysis={handleStartNewAnalysis}
        onAskQuestion={handleAskQuestion}
        onSelectHotel={handleSelectHotel}
      />

      <main className="workspace__conversation" aria-label="Conversation">
        <ConversationHeader runPhase={run.phase} period={workspace?.period ?? null} />
        <div className="conversation-body" ref={conversationBody}>
          <div className="conversation-body__content">
            {run.phase !== 'idle' ? null : workspaceState.status === 'failed' ? (
              <div className="run-banner run-banner--error" role="alert">
                <span>{workspaceState.message}</span>
                <button type="button" className="run-banner__action" onClick={reloadWorkspace}>
                  Retry
                </button>
              </div>
            ) : workspace ? (
              <SuggestedQuestions workspace={workspace} onAskQuestion={handleAskQuestion} />
            ) : (
              <p className="idle-state__loading" aria-busy="true">
                Loading the workspace…
              </p>
            )}
            {run.phase !== 'idle' && (
              <AnswerView
                run={run}
                interaction={factInteraction}
                onAskQuestion={handleAskQuestion}
                onRetry={insightRun.retry}
                onShowProvenance={setProvenanceFactId}
                onClearFocus={() => setFocusedFactId(null)}
                onOpenExplore={setExploreView}
              />
            )}
          </div>
        </div>
        <Composer
          isStreaming={run.phase === 'streaming'}
          isDisabled={!workspace}
          onAskQuestion={handleAskQuestion}
          onStop={insightRun.stop}
        />
      </main>

      <EvidencePanel
        run={run}
        interaction={factInteraction}
        openProvenance={openProvenance}
        onShowProvenance={setProvenanceFactId}
        onCloseProvenance={() => setProvenanceFactId(null)}
        onOpenExplore={setExploreView}
      />

      {exploreView && (
        <ExploreOverlay
          view={exploreView}
          run={run}
          interaction={factInteraction}
          onClose={closeExplore}
          onAskQuestion={handleAskQuestion}
        />
      )}
    </div>
  );
}
