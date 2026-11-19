import type { PropertyOverview, Workspace } from '@aurora/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Sidebar } from '../../app/layout/Sidebar';
import { ThemeProvider } from '../../design-system/ThemeProvider';
import { PropertyOverviewPage } from './PropertyOverviewPage';
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
    date: '2026-11-17',
    basis: 'results',
    asOf: '2026-11-17',
    inventory,
    unavailableRooms: [],
    upcomingRoomEvents: [],
    upcomingGroupBlocks: [],
    arrivalsAndDepartures: null,
  },
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
  return renderToStaticMarkup(<PropertyOverviewPage workspace={workspace} state={state} onRetry={() => {}} focus={null} onInvestigate={() => {}} />);
}

describe('the property overview page', () => {
  it('shows the property, the rooms tonight and last month', () => {
    const html = renderPage({ status: 'ready', overview });
    expect(html).toContain('Hotel Sablon');
    expect(html).toContain('Brussels, Belgium · Upscale city hotel');
    expect(html).toContain('fictional demo data');
    expect(html).toContain('83 occupied + 24 vacant + 2 out of order + 2 out of service = 111 rooms');
    expect(html).toContain('Not in the data');
    expect(html).toContain('Last month: Oct 2026');
    expect(html).toContain('Nov (so far)');
    // Every section has an id, so a chat answer can open it.
    for (const id of ['property-identity', 'property-inventory', 'property-financials']) expect(html).toContain(`id="${id}"`);
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
          openActionCount={0}
          onOpenDecisions={() => {}}
        />
      </ThemeProvider>,
    );
  }

  it('offers "See overview", and marks the card while the overview is open', () => {
    expect(renderSidebar(false)).toContain('See overview');
    expect(renderSidebar(false)).not.toContain('property-card--active');
    expect(renderSidebar(true)).toContain('property-card--active');
    expect(renderSidebar(true)).toContain('aria-current="page"');
  });
});
