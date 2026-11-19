import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnswerView } from '../features/conversation/AnswerView';
import { Composer } from '../features/conversation/Composer';
import type { BriefingInsight } from '@aurora/shared';
import { MorningBriefing } from '../features/briefing/MorningBriefing';
import { useMorningBriefing } from '../features/briefing/useMorningBriefing';
import { SuggestedQuestions } from '../features/empty-state/SuggestedQuestions';
import { ExploreOverlay } from '../features/explore/ExploreOverlay';
import type { InsightView } from '../features/explore/explore-views';
import type { FactInteraction } from '../features/insights/fact-links';
import { joinClassNames } from '../lib/class-names';
import { initialRunState } from '../stream/run-reducer';
import { useConversation, type ConversationTurnState } from '../stream/useConversation';
import { ConversationHeader } from './layout/ConversationHeader';
import { EvidencePanel } from './layout/EvidencePanel';
import { Sidebar } from './layout/Sidebar';
import { useConversationList } from './useConversationList';
import { useWorkspace } from './useWorkspace';

/** How close to the bottom (px) still counts as "following" the answer while it streams. */
const FOLLOW_STREAM_DISTANCE = 160;

/** The answer the evidence panel shows when none is selected: the latest one with charts or KPIs. */
function latestTurnWithEvidence(turns: ConversationTurnState[]): ConversationTurnState | undefined {
  return [...turns].reverse().find((turn) => turn.run.kpis.length > 0 || Object.keys(turn.run.charts).length > 0) ?? turns.at(-1);
}

export function App() {
  // The hotel, period and starter questions all come from the database through /api/workspace.
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const { state: workspaceState, reload: reloadWorkspace } = useWorkspace(selectedHotelId);
  const workspace = workspaceState.status === 'ready' ? workspaceState.workspace : null;
  const hotelId = workspace?.hotel.id ?? null;

  const { conversations, reload: reloadConversations } = useConversationList(hotelId);
  // Loaded once per hotel, not per chat: a new chat shows the same briefing without asking again.
  const { state: briefingState, retry: retryBriefing } = useMorningBriefing(hotelId);
  const conversation = useConversation(hotelId, reloadConversations);
  const { turns } = conversation.state;
  const lastTurn = turns.at(-1);
  const isStreaming = lastTurn?.run.phase === 'streaming';

  // Selection, as in the design, inside one answer of the thread:
  //   selectedTurnKey  the answer the evidence panel and Explore show (default: the latest with evidence)
  //   hovered          what the pointer is over (temporary highlight)
  //   focused          the figure the user clicked (contextual card + follow-ups)
  //   provenance       the figure whose calculation is open in the evidence panel
  const [selectedTurnKey, setSelectedTurnKey] = useState<string | null>(null);
  const [hoveredFactId, setHoveredFactId] = useState<string | null>(null);
  const [focusedFactId, setFocusedFactId] = useState<string | null>(null);
  const [provenanceFactId, setProvenanceFactId] = useState<string | null>(null);
  const [exploreView, setExploreView] = useState<InsightView | null>(null);
  const closeExplore = useCallback(() => setExploreView(null), []);

  const selectedTurn = turns.find((turn) => turn.key === selectedTurnKey) ?? latestTurnWithEvidence(turns);
  const selectedRun = selectedTurn?.run ?? initialRunState;

  const clearSelection = useCallback(() => {
    setSelectedTurnKey(null);
    setHoveredFactId(null);
    setFocusedFactId(null);
    setProvenanceFactId(null);
    setExploreView(null);
  }, []);

  /** Makes this answer the selected one, clearing the selection inside the previous one. */
  const selectTurn = useCallback(
    (turnKey: string) => {
      if (turnKey === selectedTurn?.key) return;
      setSelectedTurnKey(turnKey);
      setHoveredFactId(null);
      setFocusedFactId(null);
      setProvenanceFactId(null);
    },
    [selectedTurn?.key],
  );

  const interactionFor = useCallback(
    (turnKey: string): FactInteraction => {
      const isSelected = turnKey === selectedTurn?.key;
      return {
        activeFactId: isSelected ? (hoveredFactId ?? focusedFactId) : null,
        focusedFactId: isSelected ? focusedFactId : null,
        // Hovering only highlights inside the answer the evidence panel shows.
        hoverFact: (factId) => {
          if (isSelected) setHoveredFactId(factId);
        },
        focusFact: (factId) => {
          selectTurn(turnKey);
          // Selecting a figure shows the charts again, so its bar can light up.
          setProvenanceFactId(null);
          // Clicking the selected figure again clears the selection.
          setFocusedFactId((currentFactId) => (isSelected && currentFactId === factId ? null : factId));
        },
      };
    },
    [selectedTurn?.key, hoveredFactId, focusedFactId, selectTurn],
  );
  const selectedInteraction = useMemo(() => interactionFor(selectedTurn?.key ?? ''), [interactionFor, selectedTurn?.key]);

  // --- Scrolling like a chat: a new question goes to the bottom, and a streaming answer is followed
  // as long as the reader stays near the bottom.
  const conversationBody = useRef<HTMLDivElement>(null);
  const isFollowingStream = useRef(true);
  const previousTurnCount = useRef(0);
  const handleScroll = useCallback(() => {
    const body = conversationBody.current;
    if (body) isFollowingStream.current = body.scrollHeight - body.scrollTop - body.clientHeight < FOLLOW_STREAM_DISTANCE;
  }, []);
  useLayoutEffect(() => {
    const body = conversationBody.current;
    if (!body) return;
    const turnWasAdded = turns.length > previousTurnCount.current;
    previousTurnCount.current = turns.length;
    if (turnWasAdded) isFollowingStream.current = true;
    if (isFollowingStream.current) body.scrollTo({ top: body.scrollHeight });
  }, [turns]);

  const handleAskQuestion = useCallback(
    (question: string) => {
      clearSelection();
      conversation.ask(question);
    },
    [clearSelection, conversation],
  );

  /** A briefing item opens its investigation: its question, plus the exact analysis and dates as context. */
  const handleInvestigate = useCallback(
    (insight: BriefingInsight) => {
      clearSelection();
      conversation.ask(insight.action.question, insight.action.context);
    },
    [clearSelection, conversation],
  );

  const handleNewChat = useCallback(() => {
    clearSelection();
    conversation.newChat();
  }, [clearSelection, conversation]);

  const handleOpenConversation = useCallback(
    (conversationId: string) => {
      clearSelection();
      conversation.open(conversationId);
    },
    [clearSelection, conversation],
  );

  const handleSelectHotel = useCallback(
    (nextHotelId: string) => {
      clearSelection();
      setSelectedHotelId(nextHotelId);
    },
    [clearSelection],
  );

  const conversationTitle =
    conversations.find((summary) => summary.id === conversation.state.conversationId)?.title ?? turns[0]?.run.question ?? null;
  const openProvenance = provenanceFactId ? (selectedRun.provenanceByFactId[provenanceFactId] ?? null) : null;

  return (
    <div className="workspace">
      <Sidebar
        workspace={workspace}
        conversations={conversations}
        activeConversationId={conversation.state.conversationId}
        onNewChat={handleNewChat}
        onOpenConversation={handleOpenConversation}
        onSelectHotel={handleSelectHotel}
      />

      <main className="workspace__conversation" aria-label="Conversation">
        <ConversationHeader title={conversationTitle} runPhase={lastTurn?.run.phase ?? 'idle'} period={workspace?.period ?? null} />
        <div className="conversation-body" ref={conversationBody} onScroll={handleScroll}>
          <div className="conversation-body__content">
            {workspaceState.status === 'failed' && (
              <div className="run-banner run-banner--error" role="alert">
                <span>{workspaceState.message}</span>
                <button type="button" className="run-banner__action" onClick={reloadWorkspace}>
                  Retry
                </button>
              </div>
            )}
            {conversation.state.openError && (
              <div className="run-banner run-banner--error" role="alert">
                <span>{conversation.state.openError}</span>
              </div>
            )}
            {conversation.state.isOpening && (
              <p className="idle-state__loading" aria-busy="true">
                Opening the conversation…
              </p>
            )}
            {turns.length === 0 && !conversation.state.isOpening && workspaceState.status !== 'failed' &&
              (workspace ? (
                <div className="new-chat">
                  <MorningBriefing state={briefingState} onRetry={retryBriefing} onInvestigate={handleInvestigate} />
                  <SuggestedQuestions workspace={workspace} onAskQuestion={handleAskQuestion} />
                </div>
              ) : (
                <p className="idle-state__loading" aria-busy="true">
                  Loading the workspace…
                </p>
              ))}

            {turns.map((turn, turnIndex) => (
              <article
                key={turn.key}
                className={joinClassNames(
                  'conversation-turn',
                  turn.isRestored && 'conversation-turn--restored',
                  turn.key === selectedTurn?.key && turns.length > 1 && 'conversation-turn--selected',
                )}
                aria-label={`Question ${turnIndex + 1}`}
              >
                <AnswerView
                  run={turn.run}
                  isRestored={turn.isRestored}
                  isLatest={turnIndex === turns.length - 1}
                  interaction={interactionFor(turn.key)}
                  onAskQuestion={handleAskQuestion}
                  onRetry={conversation.retry}
                  onShowProvenance={(factId) => {
                    selectTurn(turn.key);
                    setProvenanceFactId(factId);
                  }}
                  onClearFocus={() => setFocusedFactId(null)}
                  onOpenExplore={(view) => {
                    selectTurn(turn.key);
                    setExploreView(view);
                  }}
                />
              </article>
            ))}
          </div>
        </div>
        <Composer
          isStreaming={isStreaming}
          isDisabled={!workspace || conversation.state.isOpening || (conversation.isBusy && !isStreaming)}
          onAskQuestion={handleAskQuestion}
          onStop={conversation.stop}
        />
      </main>

      <EvidencePanel
        run={selectedRun}
        isRestored={selectedTurn?.isRestored ?? false}
        interaction={selectedInteraction}
        openProvenance={openProvenance}
        onShowProvenance={setProvenanceFactId}
        onCloseProvenance={() => setProvenanceFactId(null)}
        onOpenExplore={setExploreView}
      />

      {exploreView && (
        <ExploreOverlay
          view={exploreView}
          run={selectedRun}
          interaction={selectedInteraction}
          onClose={closeExplore}
          onAskQuestion={(question) => {
            closeExplore();
            handleAskQuestion(question);
          }}
        />
      )}
    </div>
  );
}
