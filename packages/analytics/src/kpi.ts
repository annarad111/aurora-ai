// ---------------------------------------------------------------------------
// Standard hotel KPIs. One definition each, used everywhere.
//
//   Occupancy  = rooms sold / rooms available
//   ADR        = room revenue / rooms sold
//   RevPAR     = room revenue / rooms available   (= Occupancy × ADR)
//   Net RevPAR = (room revenue − commissions) / rooms available
//   Pickup     = rooms on the books now − rooms on the books N days ago, same stay nights
//
// Ratios are returned as fractions (0.62), money in euros, unrounded.
// Rounding is a display concern (see @aurora/shared format.ts).
// ---------------------------------------------------------------------------

/** Division that returns 0 instead of NaN or Infinity when there is nothing to divide by. */
export function divideOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** 111 rooms open for 17 nights = 1,887 rooms available. */
export function calculateRoomsAvailable(roomCount: number, nightCount: number): number {
  return roomCount * nightCount;
}

export function calculateOccupancy(roomsSold: number, roomsAvailable: number): number {
  return divideOrZero(roomsSold, roomsAvailable);
}

/** Average Daily Rate: the average price paid per room sold. */
export function calculateAdr(roomRevenue: number, roomsSold: number): number {
  return divideOrZero(roomRevenue, roomsSold);
}

/** Revenue Per Available Room. */
export function calculateRevpar(roomRevenue: number, roomsAvailable: number): number {
  return divideOrZero(roomRevenue, roomsAvailable);
}

/** RevPAR after distribution costs: the first step from revenue towards profit. */
export function calculateNetRevpar(roomRevenue: number, commissionCost: number, roomsAvailable: number): number {
  return divideOrZero(roomRevenue - commissionCost, roomsAvailable);
}

/** How many rooms were booked between two snapshots for the same stay nights. */
export function calculatePickup(roomsOnTheBooksNow: number, roomsOnTheBooksEarlier: number): number {
  return roomsOnTheBooksNow - roomsOnTheBooksEarlier;
}

export interface RoomsAndRevenue {
  roomsSold: number;
  roomRevenue: number;
}

/** Adds up rooms and revenue over any list of rows (days, segments, channels). */
export function sumRoomsAndRevenue(rows: readonly RoomsAndRevenue[]): RoomsAndRevenue {
  return rows.reduce<RoomsAndRevenue>(
    (total, row) => ({
      roomsSold: total.roomsSold + row.roomsSold,
      roomRevenue: total.roomRevenue + row.roomRevenue,
    }),
    { roomsSold: 0, roomRevenue: 0 },
  );
}

export interface PerformanceSummary extends RoomsAndRevenue {
  roomsAvailable: number;
  occupancy: number;
  adr: number;
  revpar: number;
}

/** The core KPIs for one period, from its totals. */
export function summarizePerformance(totals: RoomsAndRevenue, roomsAvailable: number): PerformanceSummary {
  return {
    roomsAvailable,
    roomsSold: totals.roomsSold,
    roomRevenue: totals.roomRevenue,
    occupancy: calculateOccupancy(totals.roomsSold, roomsAvailable),
    adr: calculateAdr(totals.roomRevenue, totals.roomsSold),
    revpar: calculateRevpar(totals.roomRevenue, roomsAvailable),
  };
}
