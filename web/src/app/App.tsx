import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnswerView } from '../features/conversation/AnswerView';
import { Composer } from '../features/conversation/Composer';
import type { BriefingInsight } from '@aurora/shared';
import type { InvestigationAction } from '../features/investigation/investigation-actions';
import { MorningBriefing } from '../features/briefing/MorningBriefing';
import { useMorningBriefing } from '../features/briefing/useMorningBriefing';
import { DecisionWorkspace } from '../features/decisions/DecisionWorkspace';
import { insightFromAnswer, insightFromBriefing } from '../features/decisions/insight-sources';
import { SaveInsightButton } from '../features/decisions/SaveInsightButton';
import { useDecisions } from '../features/decisions/useDecisions';
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

  const {
    conversations,
    reload: reloadConversations,
    rename: renameConversation,
    remove: removeConversation,
  } = useConversationList(hotelId);
  // Loaded once per hotel, not per chat: a new chat shows the same briefing without asking again.
  const { state: briefingState, retry: retryBriefing } = useMorningBriefing(hotelId);
  // Saved insights and actions, shared by the save buttons and the decision workspace.
  const decisions = useDecisions(hotelId);
  /** The main column shows the chat, or the decision workspace. */
  const [mainView, setMainView] = useState<'chat' | 'decisions'>('chat');
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
      setMainView('chat');
      conversation.ask(question);
    },
    [clearSelection, conversation],
  );

  /** A briefing item opens its investigation: its question, plus the exact analysis and dates as context. */
  const handleInvestigate = useCallback(
    (insight: BriefingInsight) => {
      clearSelection();
      setMainView('chat');
      conversation.ask(insight.action.question, insight.action.context);
    },
    [clearSelection, conversation],
  );

  /**
   * An action on a selection (a chart night, a KPI) in one answer:
   *   ask       a new question with the selection as structured context
   *   evidence  "How was this calculated?" for the figure, in the evidence panel
   *   explore   another Explore view of the same answer
   */
  const handleInvestigationAction = useCallback(
    (turnKey: string | undefined, action: InvestigationAction) => {
      if (action.kind === 'ask') {
        clearSelection();
        conversation.ask(action.question, action.context);
        return;
      }
      if (turnKey) selectTurn(turnKey);
      if (action.kind === 'evidence') {
        setExploreView(null);
        setProvenanceFactId(action.factId);
      } else {
        setExploreView(action.view);
      }
    },
    [clearSelection, conversation, selectTurn],
  );

  const handleNewChat = useCallback(() => {
    clearSelection();
    setMainView('chat');
    conversation.newChat();
  }, [clearSelection, conversation]);

  const handleOpenConversation = useCallback(
    (conversationId: string) => {
      clearSelection();
      setMainView('chat');
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
        onRenameConversation={renameConversation}
        onDeleteConversation={async (conversationId) => {
          const problem = await removeConversation(conversationId);
          // The open chat was deleted: start a new one instead of showing what no longer exists.
          if (!problem && conversationId === conversation.state.conversationId) handleNewChat();
          return problem;
        }}
        onSelectHotel={handleSelectHotel}
        isDecisionsOpen={mainView === 'decisions'}
        openActionCount={decisions.openActionCount}
        onOpenDecisions={() => {
          clearSelection();
          setMainView('decisions');
        }}
      />

      <main className="workspace__conversation" aria-label="Conversation">
        {mainView === 'decisions' && workspace ? (
          <div className="conversation-body">
            <div className="conversation-body__content">
              <DecisionWorkspace
                hotelName={workspace.hotel.name}
                store={decisions}
                onOpenConversation={handleOpenConversation}
                onInvestigateAgain={(question, context) => {
                  clearSelection();
                  setMainView('chat');
                  conversation.newChat();
                  conversation.ask(question, context ?? undefined);
                }}
              />
            </div>
          </div>
        ) : (
          <>
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
                      <MorningBriefing
                        state={briefingState}
                        onRetry={retryBriefing}
                        onInvestigate={handleInvestigate}
                        renderSaveButton={(item) => <SaveInsightButton insight={insightFromBriefing(item, workspace.hotel.id)} store={decisions} compact />}
                      />
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
                      onAction={(action) => handleInvestigationAction(turn.key, action)}
                      saveButton={
                        hotelId && (
                          <SaveInsightButton insight={insightFromAnswer(turn.run, hotelId, conversation.state.conversationId)} store={decisions} compact />
                        )
                      }
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
          </>
        )}
      </main>

      <EvidencePanel
        run={selectedRun}
        isRestored={selectedTurn?.isRestored ?? false}
        interaction={selectedInteraction}
        openProvenance={openProvenance}
        onShowProvenance={setProvenanceFactId}
        onCloseProvenance={() => setProvenanceFactId(null)}
        onOpenExplore={setExploreView}
        onAction={(action) => handleInvestigationAction(selectedTurn?.key, action)}
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
          onAction={(action) => handleInvestigationAction(selectedTurn?.key, action)}
        />
      )}
    </div>
  );
}
