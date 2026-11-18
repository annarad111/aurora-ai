// Writes the seed migrations from the deterministic demo dataset:
//   0002_seed.sql            hotels, channels, daily_stats, targets, on_the_books
//   0004_seed_workspace.sql  group_blocks, suggested_questions (added in step 12)
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
import { generateDemoDataset } from '@aurora/demo-data';

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
    dataset.groupBlocks.map((block) => [
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
  ...buildInsertStatements(
    'suggested_questions',
    ['hotel_id', 'position', 'topic', 'question'],
    dataset.suggestedQuestions.map((suggestion) => [suggestion.hotelId, suggestion.position, suggestion.topic, suggestion.question]),
  ),
];
const workspaceHeader = [
  '-- GENERATED FILE, do not edit by hand.',
  '-- Source: packages/demo-data (group blocks and starter questions), via worker/scripts/generate-seed-sql.ts',
  '',
].join('\n');
writeFileSync(resolve(migrationsDirectory, '0004_seed_workspace.sql'), `${workspaceHeader}\n${workspaceStatements.join('\n\n')}\n`);
console.log(`Wrote ${workspaceStatements.length} INSERT statements to 0004_seed_workspace.sql`);
