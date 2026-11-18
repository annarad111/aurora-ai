import { useState } from 'react';
import { Composer } from '../features/conversation/Composer';
import type { RunPhase } from '../features/conversation/run-phase';
import { SuggestedQuestions } from '../features/empty-state/SuggestedQuestions';
import { ConversationHeader } from './layout/ConversationHeader';
import { EvidencePanel } from './layout/EvidencePanel';
import { Sidebar } from './layout/Sidebar';

export function App() {
  // Step 1 only has the idle phase. Step 5 replaces this with the run reducer,
  // which is driven by the events streamed from /api/chat.
  const [runPhase] = useState<RunPhase>('idle');

  function handleAskQuestion(question: string) {
    // Not connected yet: step 5 starts a streamed run here.
    console.info('[Aurora] Question received (streaming is added in step 5):', question);
  }

  function handleStartNewAnalysis() {
    // Step 5: reset the run back to idle.
  }

  function handleStop() {
    // Step 5: abort the running stream.
  }

  return (
    <div className="workspace">
      <Sidebar onStartNewAnalysis={handleStartNewAnalysis} onAskQuestion={handleAskQuestion} />

      <main className="workspace__conversation" aria-label="Conversation">
        <ConversationHeader runPhase={runPhase} />
        <div className="conversation-body">
          <div className="conversation-body__content">
            {runPhase === 'idle' && <SuggestedQuestions onAskQuestion={handleAskQuestion} />}
          </div>
        </div>
        <Composer isStreaming={runPhase === 'streaming'} onAskQuestion={handleAskQuestion} onStop={handleStop} />
      </main>

      <EvidencePanel />
    </div>
  );
}
