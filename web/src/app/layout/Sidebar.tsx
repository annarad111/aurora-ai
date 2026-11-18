import type { Workspace } from '@aurora/shared';
import { PlusIcon } from '../../design-system/icons';
import { describeWhenAsked } from '../../lib/relative-time';
import { ThemeSwitch } from './ThemeSwitch';

interface SidebarProps {
  /** Null while the workspace is loading. */
  workspace: Workspace | null;
  onStartNewAnalysis: () => void;
  onAskQuestion: (question: string) => void;
  onSelectHotel: (hotelId: string) => void;
}

export function Sidebar({ workspace, onStartNewAnalysis, onAskQuestion, onSelectHotel }: SidebarProps) {
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
        <span className="sidebar__brand-subline">Independent concept for the Juyo assessment</span>
      </div>

      <button type="button" className="sidebar__new-analysis" onClick={onStartNewAnalysis}>
        <PlusIcon />
        New analysis
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
        {workspace && workspace.recentQuestions.length === 0 && <p className="sidebar__empty-note">Questions you ask appear here.</p>}
        {workspace?.recentQuestions.map((recentQuestion) => (
          <button
            key={recentQuestion.question}
            type="button"
            className="recent-question"
            onClick={() => onAskQuestion(recentQuestion.question)}
          >
            <span className="recent-question__text">{recentQuestion.question}</span>
            <span className="recent-question__date">{describeWhenAsked(recentQuestion.askedAt)}</span>
          </button>
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
