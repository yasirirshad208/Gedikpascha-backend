import {
  buildCombinationKey,
  parseCombinationKey,
  parseSelectedVariations,
  planVariationsFromPurchase,
  planRetailProvisioning,
  totalUnitsInPlan,
} from './retail-provisioning';

// The exact payload recorded by a real order in production.
const REAL_PURCHASE = {
  'color:Füme Beyaz|size:31': 2,
  'color:Füme Beyaz|size:32': 2,
  'color:Füme Beyaz|size:33': 3,
  'color:Füme Beyaz|size:34': 2,
  'color:Füme Beyaz|size:35': 1,
};

describe('buildCombinationKey', () => {
  it('sorts types alphabetically so the key is stable', () => {
    expect(buildCombinationKey({ size: 'M', color: 'Red' })).toBe(
      'color:Red|size:M',
    );
  });

  it('matches the storefront format for a single type', () => {
    expect(buildCombinationKey({ color: 'Red' })).toBe('color:Red');
  });

  it('trims stray whitespace on both sides of the pair', () => {
    expect(buildCombinationKey({ ' color ': ' Red ' })).toBe('color:Red');
  });

  it('drops empty types and values rather than emitting "type:"', () => {
    expect(buildCombinationKey({ color: 'Red', size: '' })).toBe('color:Red');
    expect(buildCombinationKey({ '': 'Red' })).toBe('');
  });

  it('keeps values that contain spaces and accents intact', () => {
    expect(buildCombinationKey({ color: 'Füme Beyaz', size: '31' })).toBe(
      'color:Füme Beyaz|size:31',
    );
  });
});

describe('parseCombinationKey', () => {
  it('round-trips a built key', () => {
    const pairs = { color: 'Füme Beyaz', size: '31' };
    expect(parseCombinationKey(buildCombinationKey(pairs))).toEqual(pairs);
  });

  it('keeps a value containing a colon', () => {
    // A size like "1:2 scale" must not be truncated at the first colon.
    expect(parseCombinationKey('color:Navy:Blue')).toEqual({
      color: 'Navy:Blue',
    });
  });

  it('ignores malformed segments', () => {
    expect(parseCombinationKey('color:Red|garbage|:x|y:')).toEqual({
      color: 'Red',
    });
  });

  it('returns nothing for an empty key', () => {
    expect(parseCombinationKey('')).toEqual({});
  });
});

describe('parseSelectedVariations', () => {
  it('reads the real purchase payload', () => {
    const combos = parseSelectedVariations(REAL_PURCHASE);
    expect(combos).toHaveLength(5);
    expect(combos.map((c) => c.quantity)).toEqual([2, 2, 3, 2, 1]);
    expect(combos[0].pairs).toEqual({ color: 'Füme Beyaz', size: '31' });
  });

  it('accepts the payload as a JSON string', () => {
    expect(parseSelectedVariations(JSON.stringify(REAL_PURCHASE))).toHaveLength(5);
  });

  it('returns nothing for the empty object seen on older orders', () => {
    expect(parseSelectedVariations({})).toEqual([]);
  });

  it('returns nothing for null, arrays and junk', () => {
    expect(parseSelectedVariations(null)).toEqual([]);
    expect(parseSelectedVariations(undefined)).toEqual([]);
    expect(parseSelectedVariations([1, 2])).toEqual([]);
    expect(parseSelectedVariations('not json')).toEqual([]);
  });

  it('skips zero and negative quantities', () => {
    expect(
      parseSelectedVariations({ 'color:Red': 0, 'color:Blue': -3, 'color:Green': 1 }),
    ).toHaveLength(1);
  });

  it('floors fractional quantities rather than storing them', () => {
    expect(parseSelectedVariations({ 'color:Red': 2.7 })[0].quantity).toBe(2);
  });

  it('skips entries whose key carries no usable pair', () => {
    expect(parseSelectedVariations({ garbage: 5 })).toEqual([]);
  });
});

describe('planVariationsFromPurchase', () => {
  it('creates one variation per distinct value, not per combination', () => {
    const plan = planVariationsFromPurchase(parseSelectedVariations(REAL_PURCHASE));
    const colors = plan.filter((v) => v.variationType === 'color');
    const sizes = plan.filter((v) => v.variationType === 'size');
    expect(colors.map((v) => v.name)).toEqual(['Füme Beyaz']);
    expect(sizes.map((v) => v.name)).toEqual(['31', '32', '33', '34', '35']);
  });

  it('keeps sizes in purchase order rather than sorting them as text', () => {
    // Sorted as strings "10" would come before "9"; first-seen order is right.
    const combos = parseSelectedVariations({
      'color:Red|size:9': 1,
      'color:Red|size:10': 1,
    });
    expect(
      planVariationsFromPurchase(combos)
        .filter((v) => v.variationType === 'size')
        .map((v) => v.name),
    ).toEqual(['9', '10']);
  });

  it('covers every colour when several were bought', () => {
    const combos = parseSelectedVariations({
      'color:White|size:M': 1,
      'color:Green|size:M': 1,
      'color:Red|size:L': 1,
    });
    const plan = planVariationsFromPurchase(combos);
    expect(plan.filter((v) => v.variationType === 'color').map((v) => v.name)).toEqual(
      ['White', 'Green', 'Red'],
    );
    expect(plan.filter((v) => v.variationType === 'size').map((v) => v.name)).toEqual(
      ['M', 'L'],
    );
  });

  it('assigns a unique display order across all types', () => {
    const plan = planVariationsFromPurchase(parseSelectedVariations(REAL_PURCHASE));
    expect(new Set(plan.map((v) => v.displayOrder)).size).toBe(plan.length);
  });

  it('returns nothing when nothing was bought', () => {
    expect(planVariationsFromPurchase([])).toEqual([]);
  });
});

describe('planRetailProvisioning', () => {
  it('gives every bought combination its own stock row', () => {
    const plan = planRetailProvisioning({
      selectedVariations: REAL_PURCHASE,
      totalUnits: 10,
    });
    expect(plan.usedFallback).toBe(false);
    expect(plan.inventory).toHaveLength(5);
    expect(plan.inventory.find((r) => r.combinationKey === 'color:Füme Beyaz|size:33')
      ?.stockQuantity).toBe(3);
  });

  it('accounts for exactly the units purchased', () => {
    const plan = planRetailProvisioning({
      selectedVariations: REAL_PURCHASE,
      totalUnits: 10,
    });
    expect(totalUnitsInPlan(plan)).toBe(10);
  });

  it('produces keys the storefront will look up', () => {
    // This is the bug being fixed: stock existed but under a key the product
    // page never asks for, so every variation read as out of stock.
    const plan = planRetailProvisioning({
      selectedVariations: REAL_PURCHASE,
      totalUnits: 10,
    });
    for (const row of plan.inventory) {
      expect(row.combinationKey).toBe(
        buildCombinationKey(parseCombinationKey(row.combinationKey)),
      );
    }
  });

  it('sums duplicates instead of letting one overwrite the other', () => {
    const plan = planRetailProvisioning({
      // Same combination written with the types in the other order.
      selectedVariations: { 'color:Red|size:M': 2, 'size:M|color:Red': 3 },
      totalUnits: 5,
    });
    expect(plan.inventory).toHaveLength(1);
    expect(plan.inventory[0]).toEqual({
      combinationKey: 'color:Red|size:M',
      stockQuantity: 5,
    });
  });

  it('falls back to a single default row when no variations were recorded', () => {
    const plan = planRetailProvisioning({ selectedVariations: {}, totalUnits: 40 });
    expect(plan.usedFallback).toBe(true);
    expect(plan.variations).toEqual([]);
    expect(plan.inventory).toEqual([
      { combinationKey: 'default', stockQuantity: 40 },
    ]);
  });

  it('never emits negative stock in the fallback', () => {
    const plan = planRetailProvisioning({ selectedVariations: null, totalUnits: -5 });
    expect(plan.inventory[0].stockQuantity).toBe(0);
  });

  it('handles a single-variation product (colour only)', () => {
    const plan = planRetailProvisioning({
      selectedVariations: { 'color:White': 4, 'color:Green': 6, 'color:Red': 2 },
      totalUnits: 12,
    });
    expect(plan.variations.map((v) => v.name)).toEqual(['White', 'Green', 'Red']);
    expect(totalUnitsInPlan(plan)).toBe(12);
  });
});
