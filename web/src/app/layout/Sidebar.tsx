import type { ConversationSummary, Workspace } from '@aurora/shared';
import { PlusIcon } from '../../design-system/icons';
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
  openActionCount: number;
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
  openActionCount,
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
        <span>Decisions</span>
        {openActionCount > 0 && (
          <span className="sidebar__decisions-count">
            {openActionCount}
            <span className="visually-hidden"> open action{openActionCount === 1 ? '' : 's'}</span>
          </span>
        )}
      </button>

      <section className="sidebar__section" aria-labelledby="sidebar-property-title">
        <h2 id="sidebar-property-title" className="sidebar__section-title">
          Property
        </h2>
        {hotel ? (
          <div className="property-card">
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
            isActive={!isDecisionsOpen && summary.id === activeConversationId}
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
