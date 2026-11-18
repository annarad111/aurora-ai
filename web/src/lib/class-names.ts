/**
 * Joins CSS class names and skips the empty ones.
 * Example: joinClassNames('kpi-card', isHighlighted && 'kpi-card--highlighted')
 */
export function joinClassNames(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}
