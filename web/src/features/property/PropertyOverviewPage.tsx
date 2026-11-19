import { formatPeriodLabel, type InvestigationContext, type Workspace } from '@aurora/shared';
import { useEffect, useRef } from 'react';
import { joinClassNames } from '../../lib/class-names';
import { formatWeekdayDate } from '../../lib/dates';
import { FinancialSnapshot } from './FinancialSnapshot';
import { OperationsTonight } from './OperationsTonight';
import type { PropertyOverviewState } from './usePropertyOverview';

export type PropertySection = 'identity' | 'inventory' | 'financials';

interface PropertyOverviewPageProps {
  workspace: Workspace;
  state: PropertyOverviewState;
  onRetry: () => void;
  /** The section a chat answer pointed to; `requestId` changes each time, so the same section can be shown again. */
  focus: { section: PropertySection; requestId: number } | null;
  onInvestigate: (question: string, context?: InvestigationContext) => void;
}

const SECTION_IDS: Record<PropertySection, string> = {
  identity: 'property-identity',
  inventory: 'property-inventory',
  financials: 'property-financials',
};

/**
 * The hotel itself: who it is, its rooms tonight, and last month's results.
 * Every figure can start an investigation in the chat; the detail of the
 * analysis stays there, not on this page.
 */
export function PropertyOverviewPage({ workspace, state, onRetry, focus, onInvestigate }: PropertyOverviewPageProps) {
  const pageRef = useRef<HTMLElement>(null);

  // A chat answer's button opens the exact section: it scrolls into view, takes focus and glows once.
  useEffect(() => {
    if (!focus || state.status !== 'ready') return;
    const section = document.getElementById(SECTION_IDS[focus.section]);
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section.focus({ preventScroll: true });
    section.classList.remove('property-section--spotlight');
    // Restart the glow even when the same section is asked for twice.
    void section.offsetWidth;
    section.classList.add('property-section--spotlight');
  }, [focus, state.status]);

  const { hotel } = workspace;
  if (state.status === 'loading') {
    return (
      <section className="property-page" aria-busy="true" aria-label="Property overview">
        <PropertyHeader name={hotel.name} subtitle={`${hotel.city} · ${hotel.roomCount} rooms · ${hotel.currency}`} />
        <div className="property-page__grid">
          {[0, 1].map((index) => (
            <div key={index} className="property-section property-section--skeleton" aria-hidden="true">
              <span className="skeleton skeleton--line skeleton--short" />
              <span className="skeleton skeleton--block" />
              <span className="skeleton skeleton--line" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (state.status === 'failed') {
    return (
      <section className="property-page" aria-label="Property overview">
        <PropertyHeader name={hotel.name} subtitle={`${hotel.city} · ${hotel.roomCount} rooms · ${hotel.currency}`} />
        <div className="run-banner run-banner--error" role="alert">
          <span>{state.message}</span>
          <button type="button" className="run-banner__action" onClick={onRetry}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  const { status, financial } = state.overview;
  const profile = status.profile;
  return (
    <article ref={pageRef} className="property-page" aria-label={`${hotel.name} overview`}>
      <section id={SECTION_IDS.identity} tabIndex={-1} className="property-section property-section--identity" aria-labelledby="property-name">
        <PropertyHeader
          name={hotel.name}
          subtitle={[`${hotel.city}${profile ? `, ${profile.country}` : ''}`, profile?.propertyType].filter(Boolean).join(' · ')}
        />
        <dl className="property-facts">
          <div>
            <dt>Rooms</dt>
            <dd>{hotel.roomCount}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>{hotel.currency}</dd>
          </div>
          <div>
            <dt>Time zone</dt>
            <dd>{hotel.timezone}</dd>
          </div>
          {profile && (
            <div className="property-facts__wide">
              <dt>Address</dt>
              <dd>{profile.addressLine}</dd>
            </div>
          )}
        </dl>
        {profile && profile.roomTypes.length > 0 && (
          <div className="room-types">
            <div className="room-types__bar" aria-hidden="true">
              {profile.roomTypes.map((type) => (
                <span key={type.code} className={`room-types__part room-types__part--${type.code.toLowerCase()}`} style={{ flexGrow: type.count }} />
              ))}
            </div>
            <ul className="room-types__list">
              {profile.roomTypes.map((type) => (
                <li key={type.code}>
                  <span className={`room-types__swatch room-types__part--${type.code.toLowerCase()}`} aria-hidden="true" />
                  {type.name} <strong>{type.count}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
        {profile?.isDemoData && <p className="property-demo-note">Address, room types, room numbers and maintenance are fictional demo data.</p>}
      </section>

      <div className="property-page__grid">
        <section id={SECTION_IDS.inventory} tabIndex={-1} className={joinClassNames('property-section', 'property-section--inventory')} aria-labelledby="inventory-title">
          <header className="property-section__header">
            <h2 id="inventory-title" className="property-section__title">
              Rooms tonight
            </h2>
            <span className="property-section__as-of">
              {status.basis === 'results' ? `As of ${formatWeekdayDate(status.asOf)} (the demo’s today)` : `Booked as of ${formatWeekdayDate(status.asOf)}`}
            </span>
          </header>
          <OperationsTonight status={status} onInvestigate={onInvestigate} />
          {status.upcomingRoomEvents.length > 0 && (
            <div className="property-coming-up">
              <h3 className="property-coming-up__title">Maintenance coming up</h3>
              <ul>
                {status.upcomingRoomEvents.map((room) => (
                  <li key={room.id}>
                    <strong>Room {room.roomNumber}</strong> · {room.reason} · {formatPeriodLabel({ from: room.firstNight, to: room.lastNight })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section id={SECTION_IDS.financials} tabIndex={-1} className="property-section property-section--financials" aria-labelledby="financials-title">
          <header className="property-section__header">
            <h2 id="financials-title" className="property-section__title">
              Last month: {formatPeriodLabel(financial.period)}
            </h2>
            <span className="property-section__as-of">The previous completed month</span>
          </header>
          <FinancialSnapshot financial={financial} onInvestigate={onInvestigate} />
        </section>
      </div>
    </article>
  );
}

function PropertyHeader({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <header className="property-header">
      <span className="property-header__mark" aria-hidden="true">
        {name
          .split(' ')
          .map((word) => word[0])
          .join('')
          .slice(0, 2)}
      </span>
      <div>
        <p className="morning-briefing__eyebrow">Property overview</p>
        <h1 id="property-name" className="property-header__name">
          {name}
        </h1>
        <p className="property-header__subtitle">{subtitle}</p>
      </div>
    </header>
  );
}
