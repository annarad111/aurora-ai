// ---------------------------------------------------------------------------
// Splitting whole numbers (room nights, euros) without losing any.
//
// Rounding each share on its own can make the parts add up to 1,169 or
// 1,171 instead of 1,170. These helpers guarantee the exact total, which is
// what lets the demo reproduce the design's numbers to the euro.
// ---------------------------------------------------------------------------

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Splits `total` into whole numbers proportional to `weights`, and they add up to exactly `total`.
 * Each part is first rounded down. The units left over go to the parts with
 * the largest fractional remainders. Parts with weight 0 always get 0.
 *
 * Example: allocateByLargestRemainder(10, [1, 1, 1]) -> [4, 3, 3]
 */
export function allocateByLargestRemainder(total: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error(`Can only allocate a non-negative whole number, got ${total}`);
  }
  const weightSum = sum(weights);
  if (weightSum <= 0) {
    if (total === 0) return weights.map(() => 0);
    throw new Error(`Cannot allocate ${total} when every weight is 0`);
  }

  const exactShares = weights.map((weight) => (total * weight) / weightSum);
  const allocation = exactShares.map((share) => Math.floor(share));
  let unitsLeft = total - sum(allocation);

  const indexesByRemainder = exactShares
    .map((share, index) => ({ index, remainder: share - Math.floor(share), weight: weights[index] ?? 0 }))
    .filter((candidate) => candidate.weight > 0)
    .sort((first, second) => second.remainder - first.remainder || first.index - second.index);

  for (let position = 0; unitsLeft > 0; position += 1) {
    const candidate = indexesByRemainder[position % indexesByRemainder.length]!;
    allocation[candidate.index]! += 1;
    unitsLeft -= 1;
  }
  return allocation;
}

/**
 * Fills a grid of whole numbers whose rows and columns add up to given totals.
 * Used for "room nights per day × segment": each day must have its total
 * rooms, and each segment its total rooms over the period.
 *
 * 1. Iterative proportional fitting: start from `seedWeights` (the shape we
 *    want, e.g. corporate on weekdays) and rescale rows and columns in turn
 *    until both match their totals.
 * 2. Controlled rounding: round every cell down, then give the missing units to
 *    the cells with the largest fractions, where both the row and the column are still short.
 *
 * A cell with seed weight 0 stays 0.
 */
export function balanceIntegerMatrix(
  rowTotals: readonly number[],
  columnTotals: readonly number[],
  seedWeights: readonly (readonly number[])[],
): number[][] {
  if (sum(rowTotals) !== sum(columnTotals)) {
    throw new Error(`Row totals (${sum(rowTotals)}) and column totals (${sum(columnTotals)}) must be equal`);
  }

  const columnCount = columnTotals.length;
  const fitted = seedWeights.map((row) => [...row]);

  for (let iteration = 0; iteration < 200; iteration += 1) {
    fitted.forEach((row, rowIndex) => {
      const rowSum = sum(row);
      const wantedRowTotal = rowTotals[rowIndex] ?? 0;
      if (rowSum === 0) {
        if (wantedRowTotal > 0) throw new Error(`Row ${rowIndex} needs ${wantedRowTotal} but has no allowed cells`);
        return;
      }
      row.forEach((value, columnIndex) => (row[columnIndex] = (value * wantedRowTotal) / rowSum));
    });

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const columnSum = sum(fitted.map((row) => row[columnIndex] ?? 0));
      const wantedColumnTotal = columnTotals[columnIndex] ?? 0;
      if (columnSum === 0) continue;
      fitted.forEach((row) => (row[columnIndex] = ((row[columnIndex] ?? 0) * wantedColumnTotal) / columnSum));
    }

    const largestRowError = Math.max(...fitted.map((row, rowIndex) => Math.abs(sum(row) - (rowTotals[rowIndex] ?? 0))));
    if (largestRowError < 1e-9) break;
  }

  const rounded = fitted.map((row) => row.map((value) => Math.floor(value + 1e-9)));
  const rowShortfall = rowTotals.map((total, rowIndex) => total - sum(rounded[rowIndex] ?? []));
  const columnShortfall = columnTotals.map((total, columnIndex) => total - sum(rounded.map((row) => row[columnIndex] ?? 0)));

  const cellsByFraction = fitted
    .flatMap((row, rowIndex) =>
      row.map((value, columnIndex) => ({ rowIndex, columnIndex, fraction: value - Math.floor(value + 1e-9) })),
    )
    .filter((cell) => (seedWeights[cell.rowIndex]?.[cell.columnIndex] ?? 0) > 0)
    .sort((first, second) => second.fraction - first.fraction);

  for (const cell of cellsByFraction) {
    if ((rowShortfall[cell.rowIndex] ?? 0) > 0 && (columnShortfall[cell.columnIndex] ?? 0) > 0) {
      rounded[cell.rowIndex]![cell.columnIndex]! += 1;
      rowShortfall[cell.rowIndex]! -= 1;
      columnShortfall[cell.columnIndex]! -= 1;
    }
  }

  if (rowShortfall.some((shortfall) => shortfall !== 0)) {
    throw new Error('Could not round the matrix to whole numbers with the given totals');
  }
  return rounded;
}
