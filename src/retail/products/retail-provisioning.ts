/**
 * Turning a delivered wholesale purchase into a sellable retail listing.
 *
 * The retailer never types a variation in by hand: the colours and sizes on a
 * retail listing are exactly the ones bought from wholesale, and the retailer
 * only chooses which photos each one shows. This module works out, from the
 * order item alone, which variations to create and how much stock each one
 * carries.
 *
 * `wholesale_order_items.selected_variations` is the source of truth. It is a
 * map of combination key -> quantity, recorded at checkout:
 *
 *   { "color:Füme Beyaz|size:31": 2, "color:Füme Beyaz|size:32": 2, ... }
 *
 * Deliberately NOT derived from the pack: `pack_size_id` is null on every order
 * item in production, so the pack-based path never ran. The purchase record is
 * both reliable and more precise — it knows the sizes actually bought, not
 * every size the pack could contain.
 */

export interface BoughtCombination {
  /** variation type -> chosen value, e.g. { color: 'Füme Beyaz', size: '31' } */
  pairs: Record<string, string>;
  /** Canonical key, matching what the storefront builds when looking up stock. */
  key: string;
  quantity: number;
}

export interface PlannedVariation {
  variationType: string;
  name: string;
  displayOrder: number;
}

export interface PlannedInventoryRow {
  combinationKey: string;
  stockQuantity: number;
}

export interface RetailProvisioningPlan {
  variations: PlannedVariation[];
  inventory: PlannedInventoryRow[];
  /** True when the purchase carried no variation detail at all. */
  usedFallback: boolean;
}

/**
 * Canonical combination key.
 *
 * Must match ProductDetails.buildCombinationKey on the storefront, which sorts
 * the types alphabetically and joins `type:value` with '|'. Stock lookups fail
 * silently if these two ever diverge, so the ordering is normalised here rather
 * than trusting the order in which the key was originally written.
 */
export function buildCombinationKey(pairs: Record<string, string>): string {
  const parts = Object.entries(pairs)
    .filter(([type, value]) => type.trim() !== '' && String(value).trim() !== '')
    .map(([type, value]) => [type.trim(), String(value).trim()] as const)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([type, value]) => `${type}:${value}`);
  return parts.join('|');
}

/** Splits one stored key ("color:Red|size:M") back into its type/value pairs. */
export function parseCombinationKey(key: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const part of String(key).split('|')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const type = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (type && value) pairs[type] = value;
  }
  return pairs;
}

/** Reads `selected_variations`, tolerating the shapes JSONB can hand back. */
export function parseSelectedVariations(raw: unknown): BoughtCombination[] {
  let source: unknown = raw;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];

  const out: BoughtCombination[] = [];
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const pairs = parseCombinationKey(key);
    if (Object.keys(pairs).length === 0) continue;

    out.push({
      pairs,
      key: buildCombinationKey(pairs),
      quantity: Math.floor(quantity),
    });
  }
  return out;
}

/**
 * The variations a retail listing should carry, derived from what was bought.
 *
 * Each type keeps the order the values were first seen in, so sizes stay in the
 * sequence the wholesaler listed them rather than being sorted as strings
 * ("10" before "9").
 */
export function planVariationsFromPurchase(
  combinations: BoughtCombination[],
): PlannedVariation[] {
  const byType = new Map<string, string[]>();

  for (const combo of combinations) {
    for (const [type, value] of Object.entries(combo.pairs)) {
      if (!byType.has(type)) byType.set(type, []);
      const values = byType.get(type)!;
      if (!values.includes(value)) values.push(value);
    }
  }

  const variations: PlannedVariation[] = [];
  let order = 0;
  for (const [type, values] of byType) {
    for (const name of values) {
      variations.push({ variationType: type, name, displayOrder: order++ });
    }
  }
  return variations;
}

/**
 * Builds the full plan for one order item.
 *
 * `totalUnits` is only used for the fallback: when the purchase recorded no
 * variation detail, the stock goes into a single 'default' row, which is what a
 * product with no variations looks up.
 */
export function planRetailProvisioning(input: {
  selectedVariations: unknown;
  totalUnits: number;
}): RetailProvisioningPlan {
  const combinations = parseSelectedVariations(input.selectedVariations);

  if (combinations.length === 0) {
    return {
      variations: [],
      inventory: [
        {
          combinationKey: 'default',
          stockQuantity: Math.max(0, Math.floor(input.totalUnits) || 0),
        },
      ],
      usedFallback: true,
    };
  }

  // The same combination can legitimately appear twice across a merged order;
  // add the quantities rather than letting one overwrite the other.
  const byKey = new Map<string, number>();
  for (const combo of combinations) {
    byKey.set(combo.key, (byKey.get(combo.key) ?? 0) + combo.quantity);
  }

  return {
    variations: planVariationsFromPurchase(combinations),
    inventory: [...byKey.entries()].map(([combinationKey, stockQuantity]) => ({
      combinationKey,
      stockQuantity,
    })),
    usedFallback: false,
  };
}

/** Total units a plan accounts for — used to keep stock_quantity consistent. */
export function totalUnitsInPlan(plan: RetailProvisioningPlan): number {
  return plan.inventory.reduce((sum, row) => sum + row.stockQuantity, 0);
}
