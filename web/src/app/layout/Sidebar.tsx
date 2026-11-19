import type { ConversationSummary, Workspace } from '@aurora/shared';
import { ArrowRightIcon, ChecklistIcon, PlusIcon } from '../../design-system/icons';
import { joinClassNames } from '../../lib/class-names';
import type { ConversationChangeError } from '../useConversationList';
import { RecentConversation } from './RecentConversation';
import { ThemeSwitch } from './ThemeSwitch';

interface SidebarProps {
  /** Null while the workspace is loading. */
  workspace: Workspace | null;
  /** The hotel's stored conversations, newest first. */
  conversations: ConversationSummary[];
  activeConversationId: string;
  onNewChat: () => void;
  onOpenConversation: (conversationId: string) => void;
  onRenameConversation: (conversationId: string, title: string) => Promise<ConversationChangeError>;
  onDeleteConversation: (conversationId: string) => Promise<ConversationChangeError>;
  onSelectHotel: (hotelId: string) => void;
  /** True while the decision workspace is open. */
  isDecisionsOpen: boolean;
  /** True while the property overview is open. */
  isPropertyOpen: boolean;
  onOpenProperty: () => void;
  /** What is waiting in Decisions; null while it loads. */
  decisionsSummary: { open: number; overdue: number; saved: number } | null;
  onOpenDecisions: () => void;
}

export function Sidebar({
  workspace,
  conversations,
  activeConversationId,
  onNewChat,
  onOpenConversation,
  onRenameConversation,
  onDeleteConversation,
  onSelectHotel,
  isDecisionsOpen,
  isPropertyOpen,
  onOpenProperty,
  decisionsSummary,
  onOpenDecisions,
}: SidebarProps) {
  const hotel = workspace?.hotel;

  return (
    <aside className="sidebar workspace__sidebar" aria-label="Sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__brand-row">
          <span className="brand-logo" aria-hidden="true">
            <img className="brand-logo__image" src="/aurora-mark.png" alt="" />
          </span>
          <span className="sidebar__brand-name">aurora</span>
        </div>
      </div>

      <button type="button" className="sidebar__new-analysis" onClick={onNewChat}>
        <PlusIcon />
        New chat
      </button>

      <button
        type="button"
        className={joinClassNames('sidebar__decisions', isDecisionsOpen && 'sidebar__decisions--active')}
        aria-current={isDecisionsOpen ? 'page' : undefined}
        onClick={onOpenDecisions}
      >
        <span className="sidebar__decisions-icon" aria-hidden="true">
          <ChecklistIcon />
        </span>
        <span className="sidebar__decisions-text">
          <span className="sidebar__decisions-label">Decisions</span>
          <span className="sidebar__decisions-summary">
            <DecisionsSummary summary={decisionsSummary} />
          </span>
        </span>
        {decisionsSummary && decisionsSummary.open > 0 && (
          <span className={joinClassNames('sidebar__decisions-count', decisionsSummary.overdue > 0 && 'sidebar__decisions-count--overdue')} aria-hidden="true">
            {decisionsSummary.open}
          </span>
        )}
      </button>

      <section className="sidebar__section" aria-labelledby="sidebar-property-title">
        <h2 id="sidebar-property-title" className="sidebar__section-title">
          Property
        </h2>
        {hotel ? (
          <div className={joinClassNames('property-card', isPropertyOpen && 'property-card--active')}>
            {workspace.hotels.length > 1 ? (
              <select
                className="property-card__select"
                aria-label="Hotel"
                value={hotel.id}
                onChange={(event) => onSelectHotel(event.target.value)}
              >
                {workspace.hotels.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="property-card__name">{hotel.name}</span>
            )}
            <span className="property-card__details">
              {hotel.city} · {hotel.roomCount} rooms · {hotel.currency}
            </span>
            <button
              type="button"
              className="property-card__overview"
              aria-current={isPropertyOpen ? 'page' : undefined}
              onClick={onOpenProperty}
            >
              <span>{isPropertyOpen ? 'Viewing overview' : 'See overview'}</span>
              <ArrowRightIcon size={14} />
            </button>
          </div>
        ) : (
          <div className="property-card property-card--loading" aria-busy="true" />
        )}
      </section>

      <section className="sidebar__section sidebar__section--recent" aria-labelledby="sidebar-recent-title">
        <h2 id="sidebar-recent-title" className="sidebar__section-title">
          Recent
        </h2>
        {workspace && conversations.length === 0 && <p className="sidebar__empty-note">Your conversations appear here.</p>}
        {conversations.map((summary) => (
          <RecentConversation
            key={summary.id}
            summary={summary}
            isActive={!isDecisionsOpen && !isPropertyOpen && summary.id === activeConversationId}
            onOpen={() => onOpenConversation(summary.id)}
            onRename={(title) => onRenameConversation(summary.id, title)}
            onDelete={() => onDeleteConversation(summary.id)}
          />
        ))}
      </section>

      <div className="sidebar__footer">
        {workspace && (
          <div className="mcp-status">
            <span className="mcp-status__dot" aria-hidden="true" />
            <span className="mcp-status__endpoint">{workspace.mcp.endpoint}</span>
            <span>· {workspace.mcp.toolCount} read-only tools</span>
          </div>
        )}
        <ThemeSwitch />
      </div>
    </aside>
  );
}

/** "2 open · 1 overdue", or how to start: what is waiting, readable without opening the page. */
function DecisionsSummary({ summary }: { summary: SidebarProps['decisionsSummary'] }) {
  if (!summary) return <>Saved insights and actions</>;
  if (summary.open === 0) return <>{summary.saved === 0 ? 'Save an insight to start' : `${summary.saved} saved · nothing open`}</>;
  return (
    <>
      {summary.open} open
      {summary.overdue > 0 && <span className="sidebar__decisions-overdue"> · {summary.overdue} overdue</span>}
    </>
  );
}
