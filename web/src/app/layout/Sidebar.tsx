import { PlusIcon } from '../../design-system/icons';
import { CURRENT_PROPERTY, MCP_TOOL_COUNT, RECENT_QUESTIONS } from '../workspace-content';
import { ThemeSwitch } from './ThemeSwitch';

interface SidebarProps {
  onStartNewAnalysis: () => void;
  onAskQuestion: (question: string) => void;
}

export function Sidebar({ onStartNewAnalysis, onAskQuestion }: SidebarProps) {
  return (
    <aside className="sidebar workspace__sidebar" aria-label="Sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__brand-row">
          <span className="brand-logo" aria-hidden="true" />
          <span className="sidebar__brand-name">Aurora</span>
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
        <div className="property-card">
          <span className="property-card__name">{CURRENT_PROPERTY.name}</span>
          <span className="property-card__details">
            {CURRENT_PROPERTY.city} · {CURRENT_PROPERTY.roomCount} rooms · {CURRENT_PROPERTY.currency}
          </span>
        </div>
      </section>

      <section className="sidebar__section sidebar__section--recent" aria-labelledby="sidebar-recent-title">
        <h2 id="sidebar-recent-title" className="sidebar__section-title">
          Recent
        </h2>
        {RECENT_QUESTIONS.map((recentQuestion) => (
          <button
            key={recentQuestion.question}
            type="button"
            className="recent-question"
            onClick={() => onAskQuestion(recentQuestion.question)}
          >
            <span className="recent-question__text">{recentQuestion.question}</span>
            <span className="recent-question__date">{recentQuestion.askedOnLabel}</span>
          </button>
        ))}
      </section>

      <div className="sidebar__footer">
        <div className="mcp-status">
          <span className="mcp-status__dot" aria-hidden="true" />
          <span className="mcp-status__endpoint">/mcp</span>
          <span>· {MCP_TOOL_COUNT} read-only tools</span>
        </div>
        <ThemeSwitch />
      </div>
    </aside>
  );
}
