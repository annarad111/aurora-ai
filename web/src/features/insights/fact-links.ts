// ---------------------------------------------------------------------------
// Which on-screen elements belong together.
//
// Every figure, chip, KPI card and (in step 6) chart bar carries a fact id.
// When one of them is hovered or selected, everything linked to the same fact
// lights up. Some facts are also related to others: the pure price effect is
// ADR's contribution, so hovering it also highlights the ADR card.
// ---------------------------------------------------------------------------

const RELATED_FACT_IDS: Record<string, string[]> = {
  revenue_gap: ['revpar'],
  pure_price: ['adr'],
  price_effect: ['adr'],
  volume: ['occupancy'],
  volume_mice: ['occupancy'],
  ota_share: ['net_revpar'],
  commission_cost: ['net_revpar'],
  commission_mix_shift: ['net_revpar'],
};

/**
 * Hover and selection, shared by every component that shows a fact.
 *   activeFactId   what is highlighted right now: the hovered fact, else the selected one
 *   focusedFactId  the fact the user clicked (step 6 opens a contextual card for it)
 */
export interface FactInteraction {
  activeFactId: string | null;
  focusedFactId: string | null;
  hoverFact: (factId: string | null) => void;
  focusFact: (factId: string) => void;
}

/** True when an element showing `factId` should be highlighted while `activeFactId` is hovered or selected. */
export function isFactHighlighted(factId: string, activeFactId: string | null): boolean {
  if (activeFactId === null) return false;
  return factId === activeFactId || (RELATED_FACT_IDS[activeFactId] ?? []).includes(factId);
}
