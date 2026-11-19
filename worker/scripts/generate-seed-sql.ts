// Writes the seed migrations from the deterministic demo dataset:
//   0002_seed.sql            hotels, channels, daily_stats, targets, on_the_books
//   0004_seed_workspace.sql  group_blocks (added in step 12)
// A migration runs once per database, so new data goes into a new file instead of
// changing one that is already applied.
//
//   npm run db:seed:generate
//
// The output is committed, so the database content is reviewable in git and
// identical everywhere. Re-run this script whenever packages/demo-data changes.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_GROUP_BLOCKS, DEMO_UPCOMING_GROUP_BLOCKS, generateDemoDataset } from '@aurora/demo-data';

/** Rows per INSERT statement. Keeps each statement well under D1's size limit. */
const ROWS_PER_INSERT = 200;

type SqlValue = string | number | null;

function toSqlLiteral(value: SqlValue): string {
  if (value === null) return 'NULL';
  return typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`;
}

function buildInsertStatements(table: string, columns: string[], rows: SqlValue[][]): string[] {
  const statements: string[] = [];
  for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
    const valueLines = rows
      .slice(start, start + ROWS_PER_INSERT)
      .map((row) => `  (${row.map(toSqlLiteral).join(', ')})`)
      .join(',\n');
    statements.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${valueLines};`);
  }
  return statements;
}

const dataset = generateDemoDataset();

const statements = [
  ...buildInsertStatements(
    'hotels',
    ['id', 'name', 'city', 'room_count', 'currency', 'timezone'],
    dataset.hotels.map((hotel) => [hotel.id, hotel.name, hotel.city, hotel.roomCount, hotel.currency, hotel.timezone]),
  ),
  ...buildInsertStatements(
    'channels',
    ['code', 'name', 'commission_rate'],
    dataset.channelCommissions.map((channel) => [channel.channel, channel.name, channel.commissionRate]),
  ),
  ...buildInsertStatements(
    'daily_stats',
    ['hotel_id', 'date', 'segment', 'channel', 'rooms_sold', 'room_revenue', 'cancellations'],
    dataset.dailyStats.map((row) => [row.hotelId, row.date, row.segment, row.channel, row.roomsSold, row.roomRevenue, row.cancellations]),
  ),
  ...buildInsertStatements(
    'targets',
    ['hotel_id', 'date', 'segment', 'rooms_target', 'room_revenue_target'],
    dataset.dailyTargets.map((row) => [row.hotelId, row.date, row.segment, row.roomsTarget, row.roomRevenueTarget]),
  ),
  ...buildInsertStatements(
    'on_the_books',
    ['hotel_id', 'snapshot_date', 'stay_date', 'rooms_otb', 'revenue_otb'],
    dataset.onTheBooks.map((row) => [row.hotelId, row.snapshotDate, row.stayDate, row.roomsOnTheBooks, row.revenueOnTheBooks]),
  ),
];

const header = [
  '-- GENERATED FILE, do not edit by hand.',
  '-- Source: packages/demo-data (the planted story), via worker/scripts/generate-seed-sql.ts',
  `-- ${dataset.dailyStats.length} daily_stats rows, ${dataset.dailyTargets.length} targets rows, ${dataset.onTheBooks.length} on_the_books rows`,
  '',
].join('\n');

const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');
writeFileSync(resolve(migrationsDirectory, '0002_seed.sql'), `${header}\n${statements.join('\n\n')}\n`);
console.log(`Wrote ${statements.length} INSERT statements to 0002_seed.sql`);

const workspaceStatements = [
  ...buildInsertStatements(
    'group_blocks',
    ['id', 'hotel_id', 'name', 'segment', 'first_night', 'last_night', 'rooms_per_night', 'status', 'cancelled_on'],
    // 0004 is already applied: it keeps the blocks it was written with. Later blocks go into 0010.
    DEMO_GROUP_BLOCKS.map((block) => [
      block.id,
      block.hotelId,
      block.name,
      block.segment,
      block.firstNight,
      block.lastNight,
      block.roomsPerNight,
      block.status,
      block.cancelledOn,
    ]),
  ),
];
const workspaceHeader = [
  '-- GENERATED FILE, do not edit by hand.',
  '-- Source: packages/demo-data (group blocks), via worker/scripts/generate-seed-sql.ts',
  '',
].join('\n');
writeFileSync(resolve(migrationsDirectory, '0004_seed_workspace.sql'), `${workspaceHeader}\n${workspaceStatements.join('\n\n')}\n`);
console.log(`Wrote ${workspaceStatements.length} INSERT statements to 0004_seed_workspace.sql`);

// --- 0009: the property (fictional profile, rooms, maintenance) ---------------------
const propertyStatements = [
  ...buildInsertStatements(
    'property_profiles',
    ['hotel_id', 'country', 'address_line', 'property_type', 'room_types_json', 'is_demo_data'],
    dataset.propertyProfiles.map((profile) => [
      profile.hotelId,
      profile.country,
      profile.addressLine,
      profile.propertyType,
      JSON.stringify(profile.roomTypes),
      profile.isDemoData ? 1 : 0,
    ]),
  ),
  ...buildInsertStatements(
    'rooms',
    ['hotel_id', 'room_number', 'floor', 'room_type_code'],
    dataset.rooms.map((room) => [room.hotelId, room.roomNumber, room.floor, room.roomTypeCode]),
  ),
  ...buildInsertStatements(
    'room_status_events',
    ['id', 'hotel_id', 'room_number', 'kind', 'reason', 'description', 'first_night', 'last_night'],
    dataset.roomStatusEvents.map((event) => [
      event.id,
      event.hotelId,
      event.roomNumber,
      event.kind,
      event.reason,
      event.description,
      event.firstNight,
      event.lastNight,
    ]),
  ),
];
const propertyHeader = [
  '-- GENERATED FILE, do not edit by hand.',
  '-- Source: packages/demo-data/src/property.ts (fictional demo data), via worker/scripts/generate-seed-sql.ts',
  '',
].join('\n');
writeFileSync(resolve(migrationsDirectory, '0009_seed_property.sql'), `${propertyHeader}\n${propertyStatements.join('\n\n')}\n`);
console.log(`Wrote ${propertyStatements.length} INSERT statements to 0009_seed_property.sql`);

// --- 0010: a confirmed group arriving after today (fictional) --------------------------
const upcomingGroupStatements = buildInsertStatements(
  'group_blocks',
  ['id', 'hotel_id', 'name', 'segment', 'first_night', 'last_night', 'rooms_per_night', 'status', 'cancelled_on'],
  DEMO_UPCOMING_GROUP_BLOCKS.map((block) => [
    block.id,
    block.hotelId,
    block.name,
    block.segment,
    block.firstNight,
    block.lastNight,
    block.roomsPerNight,
    block.status,
    block.cancelledOn,
  ]),
);
const upcomingGroupHeader = [
  '-- GENERATED FILE, do not edit by hand.',
  '-- Source: packages/demo-data/src/property.ts (fictional demo data), via worker/scripts/generate-seed-sql.ts',
  '',
].join('\n');
writeFileSync(resolve(migrationsDirectory, '0010_seed_upcoming_group.sql'), `${upcomingGroupHeader}\n${upcomingGroupStatements.join('\n\n')}\n`);
console.log(`Wrote ${upcomingGroupStatements.length} INSERT statements to 0010_seed_upcoming_group.sql`);
