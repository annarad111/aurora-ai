import type { PropertyOverview, Workspace } from '@aurora/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Sidebar } from '../../app/layout/Sidebar';
import { ThemeProvider } from '../../design-system/ThemeProvider';
import { PropertyOverviewPage } from './PropertyOverviewPage';
import { eventEvidence, inventoryEvidence, kpiEvidence } from './property-evidence';
import { inventoryReconciles, splitInventory } from './room-inventory';

const hotel = { id: 'sablon-bru', name: 'Hotel Sablon', city: 'Brussels', roomCount: 111, currency: 'EUR' as const, timezone: 'Europe/Brussels' };
const workspace: Workspace = {
  hotels: [hotel],
  hotel,
  today: '2026-11-17',
  period: { from: '2026-11-01', to: '2026-11-17' },
  suggestions: [],
  mcp: { endpoint: '/mcp', toolCount: 9 },
};

const inventory = { physicalRooms: 111, occupied: 83, outOfOrder: 2, outOfService: 2, vacantAvailable: 24, sellableRooms: 107, occupancyOfPhysical: 83 / 111, occupancyOfSellable: 83 / 107 };

const overview: PropertyOverview = {
  status: {
    hotel,
    profile: {
      hotelId: 'sablon-bru',
      country: 'Belgium',
      addressLine: 'Rue des Minimes 12, 1000 Brussels (fictional demo address)',
      propertyType: 'Upscale city hotel',
      roomTypes: [
        { code: 'CLS', name: 'Classic Double', count: 58 },
        { code: 'SUP', name: 'Superior Double', count: 33 },
        { code: 'DLX', name: 'Deluxe King', count: 14 },
        { code: 'JRS', name: 'Junior Suite', count: 6 },
      ],
      isDemoData: true,
    },
    floors: [1, 2, 3, 4, 5, 6].map((floor) => ({ floor, rooms: floor <= 3 ? 19 : 18, firstRoom: `${floor}01`, lastRoom: `${floor}${floor <= 3 ? 19 : 18}` })),
    date: '2026-11-17',
    basis: 'results',
    asOf: '2026-11-17',
    inventory,
    unavailableRooms: [],
    upcomingRoomEvents: [],
    upcomingGroupBlocks: [],
    arrivalsAndDepartures: null,
  },
  events: [
    {
      type: 'maintenance',
      id: 'maint-305-air-conditioning',
      roomNumbers: ['305'],
      roomTypeNames: ['Classic Double'],
      kind: 'out_of_order',
      reason: 'Air conditioning repair',
      description: 'The air conditioning unit failed.',
      firstNight: '2026-11-15',
      lastNight: '2026-11-21',
      backOn: '2026-11-22',
      status: 'in_progress',
      impact: {
        roomNights: 7,
        nights: [
          { date: '2026-11-17', basis: 'results', vacantRooms: 24, isFull: false },
          { date: '2026-11-18', basis: 'on_the_books', vacantRooms: 33, isFull: false },
        ],
        nightsFull: 0,
        fewestVacant: { rooms: 24, date: '2026-11-17' },
      },
    },
    {
      type: 'group_cancellation',
      id: 'eu-health-congress-2026',
      name: 'EU Health Congress',
      segment: 'mice',
      firstNight: '2026-11-10',
      lastNight: '2026-11-12',
      roomsPerNight: 68,
      roomNights: 204,
      cancelledOn: '2026-10-28',
    },
  ],
  financial: {
    period: { from: '2026-10-01', to: '2026-10-31' },
    kpis: [{ metric: 'room_revenue', actual: 447727, target: 473983, lastYear: 431844, status: 'off_track' }],
    monthlyRevenue: [
      { label: 'Oct 2026', period: { from: '2026-10-01', to: '2026-10-31' }, isComplete: true, roomRevenue: 447727, roomRevenueTarget: 473983, roomRevenueLastYear: 431844 },
      { label: 'Nov 2026', period: { from: '2026-11-01', to: '2026-11-17' }, isComplete: false, roomRevenue: 208260, roomRevenueTarget: 242177, roomRevenueLastYear: 227585 },
    ],
    historyStart: '2026-10-01',
  },
};

describe('the room inventory', () => {
  it('has four statuses that add up to the physical rooms', () => {
    expect(splitInventory(inventory).map((segment) => [segment.status, segment.rooms])).toEqual([
      ['occupied', 83],
      ['vacant', 24],
      ['out_of_order', 2],
      ['out_of_service', 2],
    ]);
    expect(inventoryReconciles(inventory)).toBe(true);
    expect(inventoryReconciles({ ...inventory, vacantAvailable: 25 })).toBe(false);
  });
});

function renderPage(state: Parameters<typeof PropertyOverviewPage>[0]['state']) {
  return renderToStaticMarkup(
    <PropertyOverviewPage
      workspace={workspace}
      state={state}
      onRetry={() => {}}
      focus={null}
      onInvestigate={() => {}}
      briefingState={{ status: 'loading' }}
      renderSaveButton={() => null}
    />,
  );
}

describe('the property overview page', () => {
  it('shows the property, the rooms tonight and last month', () => {
    const html = renderPage({ status: 'ready', overview });
    expect(html).toContain('Hotel Sablon');
    expect(html).toContain('Brussels, Belgium · Upscale city hotel');
    expect(html).toContain('fictional demo data');
    expect(html).toContain('83 occupied + 24 vacant + 2 out of order + 2 out of service = 111 rooms');
    expect(html).toContain('Not in the data');
    expect(html).toContain('Arrivals and departures need reservations');
    expect(html).toContain('Last month: Oct 2026');
    expect(html).toContain('Nov (so far)');
    // Every section has an id, so a chat answer can open it.
    for (const id of ['property-identity', 'property-inventory', 'property-financials']) expect(html).toContain(`id="${id}"`);
  });

  it('lists events with their status and measured impact, and the intelligence section', () => {
    const html = renderPage({ status: 'ready', overview });
    expect(html).toContain('Events &amp; alerts');
    expect(html).toContain('Room 305: Air conditioning repair');
    expect(html).toContain('In progress');
    expect(html).toContain('7 room nights unsellable · no lost sales: never a full night');
    expect(html).toContain('204 room nights lost');
    expect(html).toContain('Property intelligence');
    // Events open in place: closed by default, and announced as such.
    expect(html).toContain('aria-expanded="false"');
    // The evidence drawer takes no space until asked for.
    expect(html).not.toContain('evidence-drawer');
  });

  it('has loading and error states', () => {
    expect(renderPage({ status: 'loading' })).toContain('aria-busy="true"');
    const failed = renderPage({ status: 'failed', message: 'The server answered 500.' });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('Retry');
  });
});

describe('the sidebar property card', () => {
  function renderSidebar(isPropertyOpen: boolean) {
    return renderToStaticMarkup(
      <ThemeProvider>
        <Sidebar
          workspace={workspace}
          conversations={[]}
          activeConversationId="none"
          onNewChat={() => {}}
          onOpenConversation={() => {}}
          onRenameConversation={async () => null}
          onDeleteConversation={async () => null}
          onSelectHotel={() => {}}
          isDecisionsOpen={false}
          isPropertyOpen={isPropertyOpen}
          onOpenProperty={() => {}}
          decisionsSummary={{ open: 2, overdue: 1, saved: 3 }}
          onOpenDecisions={() => {}}
        />
      </ThemeProvider>,
    );
  }

  it('offers "See overview", and marks the card while the overview is open', () => {
    expect(renderSidebar(false)).toContain('See overview');
    expect(renderSidebar(true)).toContain('Viewing overview');
    expect(renderSidebar(false)).not.toContain('property-card--active');
    expect(renderSidebar(true)).toContain('property-card--active');
    expect(renderSidebar(true)).toContain('aria-current="page"');
  });

  it('shows what is waiting in Decisions, with overdue actions marked', () => {
    const html = renderSidebar(false);
    expect(html).toContain('2 open');
    expect(html).toContain('sidebar__decisions-overdue');
    expect(html).toContain('1 overdue');
    expect(html).toContain('sidebar__decisions-count--overdue');
  });
});

describe('the evidence of the property figures', () => {
  it('shows how the vacant rooms are calculated, from the same numbers as the page', () => {
    const evidence = inventoryEvidence(overview.status);
    expect(evidence).toMatchObject({ tool: 'get_property_status', displayValue: '24 vacant and available' });
    expect(evidence.formula).toBe('vacant & available = physical rooms − occupied − out of order − out of service');
    expect(evidence.inputs.map((input) => input.value).slice(0, 4)).toEqual(['111', '83', '2', '2']);
  });

  it('shows each night of a maintenance event, and the period of a KPI', () => {
    expect(eventEvidence(overview.events[0]!).inputs).toEqual([
      { label: '2026-11-17', value: '24 vacant' },
      { label: '2026-11-18 (booked so far)', value: '33 vacant' },
    ]);
    expect(kpiEvidence(overview.financial.kpis[0]!, overview.financial.period)).toMatchObject({ title: 'Room revenue, Oct 2026', tool: 'get_hotel_overview' });
  });
});
