// Runs the four tools on the demo data and prints the key numbers.
//
//   npm run tools:demo            readable summary
//   npm run tools:demo -- --json  full JSON output of every tool

import { DEMO_CURRENT_PERIOD, DEMO_HOTEL } from '@aurora/demo-data';
import {
  CHANNEL_LABELS,
  formatCount,
  formatEuro,
  formatPercent,
  formatPercentagePoints,
  METRIC_META,
  SEGMENT_LABELS,
  type KpiComparison,
} from '@aurora/shared';
import { createDemoToolContext } from '../src/demo-context';
import { callTool } from '../src/tools/registry';

const context = createDemoToolContext();
const periodInput = { hotelId: DEMO_HOTEL.id, period: DEMO_CURRENT_PERIOD };

const overview = await callTool('get_hotel_overview', periodInput, context);
const drivers = await callTool('analyze_revenue_drivers', periodInput, context);
const channelMix = await callTool('get_channel_mix', periodInput, context);
const pace = await callTool('get_booking_pace', { hotelId: DEMO_HOTEL.id, stayFrom: '2026-11-21', stayTo: '2026-11-30' }, context);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ overview, drivers, channelMix, pace }, null, 2));
  process.exit(0);
}

function formatMetricValue(kpi: KpiComparison, value: number | null): string {
  if (value === null) return '—';
  const { unit } = METRIC_META[kpi.metric];
  if (unit === 'ratio') return formatPercent(value);
  if (unit === 'currency') return formatEuro(value, { decimals: kpi.metric === 'room_revenue' ? 0 : 2 });
  return formatCount(value);
}

const printSection = (title: string) => console.log(`\n=== ${title} ===`);
const printRow = (label: string, value: string) => console.log(`  ${label.padEnd(34)} ${value}`);

printSection(`get_hotel_overview · ${overview.hotel.name} · ${overview.period.from} … ${overview.period.to}`);
printRow('Rooms available', formatCount(overview.roomsAvailable));
for (const kpi of overview.kpis) {
  printRow(
    METRIC_META[kpi.metric].label,
    `${formatMetricValue(kpi, kpi.actual)}  target ${formatMetricValue(kpi, kpi.target)}  last year ${formatMetricValue(kpi, kpi.lastYear)}  [${kpi.status}]`,
  );
}
for (const segment of overview.segments) {
  printRow(
    `  ${SEGMENT_LABELS[segment.segment]} room nights`,
    `${segment.roomsSold} (target ${segment.roomsTarget}, last year ${segment.roomsSoldLastYear}, cancelled ${segment.roomsCancelled})`,
  );
}
printRow('Occupancy 10–12 Nov', overview.dailyOccupancy.slice(9, 12).map((day) => formatPercent(day.occupancy)).join(', '));

printSection('analyze_revenue_drivers');
printRow('Revenue actual / target', `${formatEuro(drivers.roomRevenueActual)} / ${formatEuro(drivers.roomRevenueTarget)}`);
printRow('Gap', formatEuro(drivers.revenueGap));
printRow('Volume effect', formatEuro(drivers.volumeEffect, { signDisplay: 'always' }));
printRow('Mix effect', formatEuro(drivers.mixEffect, { signDisplay: 'always' }));
printRow('Pure price effect', formatEuro(drivers.purePriceEffect, { signDisplay: 'always' }));
printRow('Price effect (mix + pure price)', formatEuro(drivers.priceEffect, { signDisplay: 'always' }));
for (const segment of drivers.segments) {
  printRow(
    `  ${SEGMENT_LABELS[segment.segment]} volume / share`,
    `${formatEuro(segment.volumeEffect, { signDisplay: 'always' })}   ${formatPercent(segment.shareOfRoomsActual, { decimals: 0 })} vs ${formatPercent(segment.shareOfRoomsTarget, { decimals: 0 })} target`,
  );
}
printRow('Top 3 findings', drivers.findings.slice(0, 3).map((finding) => `${finding.id} ${formatEuro(finding.impactEur)}`).join(', '));

printSection('get_channel_mix');
for (const channel of channelMix.channels) {
  printRow(
    CHANNEL_LABELS[channel.channel],
    `${formatPercent(channel.revenueShare)} (last year ${formatPercent(channel.revenueShareLastYear)})  commission ${formatEuro(channel.commissionCost)}`,
  );
}
printRow('Commission paid', `${formatEuro(channelMix.totalCommissionCost)} (${formatPercent(channelMix.commissionShareOfRevenue)} of revenue)`);
printRow('Extra commission from the mix shift', formatEuro(channelMix.extraCommissionFromMixShift));
printRow('Net RevPAR / target', `${formatEuro(channelMix.netRevpar, { decimals: 2 })} / ${channelMix.netRevparTarget === null ? '—' : formatEuro(channelMix.netRevparTarget, { decimals: 2 })}`);
for (const comparison of channelMix.comparisonPeriods) {
  printRow(`  ${comparison.label}`, `OTA ${formatPercent(comparison.revenueShareByChannel.ota ?? 0, { decimals: 0 })}, commission ${formatPercent(comparison.commissionShareOfRevenue)}`);
}

printSection(`get_booking_pace · stays ${pace.stayFrom} … ${pace.stayTo} · snapshot ${pace.snapshotDate}`);
printRow('On the books / last year', `${pace.roomsOnTheBooks} / ${pace.roomsOnTheBooksLastYear}  (${formatPercent(pace.changeVsLastYear, { signDisplay: 'always' })})  [${pace.status}]`);
printRow('Pickup last 7 days', `${formatCount(pace.pickupLast7Days, { signDisplay: 'always' })} vs ${formatCount(pace.pickupLast7DaysLastYear, { signDisplay: 'always' })} last year`);
printRow('OTA share change vs last year', formatPercentagePoints((channelMix.channels.find((line) => line.channel === 'ota')?.revenueShare ?? 0) - (channelMix.channels.find((line) => line.channel === 'ota')?.revenueShareLastYear ?? 0)));
