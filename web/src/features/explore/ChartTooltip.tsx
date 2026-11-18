import type { ReactNode } from 'react';

interface ChartTooltipProps {
  /** Position of the column the tooltip belongs to, so it can lean inwards at the edges of the chart. */
  columnIndex: number;
  columnCount: number;
  /** Distance from the bottom of the plot, as a CSS length. */
  bottom: string;
  children: ReactNode;
}

/**
 * Dark tooltip above a chart column. Near the left or right edge it shifts
 * inwards so it never gets cut off by the dialog.
 */
export function ChartTooltip({ columnIndex, columnCount, bottom, children }: ChartTooltipProps) {
  const edgeColumns = Math.max(2, Math.round(columnCount * 0.18));
  const horizontalShift = columnIndex < edgeColumns ? '-20%' : columnIndex >= columnCount - edgeColumns ? '-80%' : '-50%';
  return (
    <div className="chart-tooltip" role="tooltip" style={{ bottom, transform: `translateX(${horizontalShift})` }}>
      {children}
    </div>
  );
}
