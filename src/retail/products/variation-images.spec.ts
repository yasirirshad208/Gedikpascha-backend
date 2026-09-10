import {
  normalizeImageIndices,
  buildImportedVariationRecords,
  WholesaleVariationSource,
} from './products.service';

describe('normalizeImageIndices', () => {
  it('returns null for absent links so the gallery falls back to all images', () => {
    expect(normalizeImageIndices(null, 5)).toBeNull();
    expect(normalizeImageIndices(undefined, 5)).toBeNull();
    expect(normalizeImageIndices([], 5)).toBeNull();
  });

  it('keeps valid in-range indices', () => {
    expect(normalizeImageIndices([0, 2], 5)).toEqual([0, 2]);
  });

  it('sorts indices so the gallery order is deterministic', () => {
    expect(normalizeImageIndices([3, 0, 1], 5)).toEqual([0, 1, 3]);
  });

  it('de-duplicates repeated indices', () => {
    expect(normalizeImageIndices([2, 2, 2], 5)).toEqual([2]);
  });

  it('drops indices past the end of the image list', () => {
    // Seller linked photo #5 then deleted photos: only 3 remain.
    expect(normalizeImageIndices([0, 4], 3)).toEqual([0]);
  });

  it('returns null when every index is stale rather than an empty array', () => {
    // An empty array would mean "show nothing" to the gallery; null means
    // "no link at all", which is the correct fallback.
    expect(normalizeImageIndices([7, 8], 3)).toBeNull();
  });

  it('rejects negative and non-integer indices', () => {
    expect(normalizeImageIndices([-1, 1.5, 2], 5)).toEqual([2]);
    expect(normalizeImageIndices([-1], 5)).toBeNull();
  });

  it('rejects NaN and Infinity', () => {
    expect(normalizeImageIndices([NaN, Infinity, 1], 5)).toEqual([1]);
  });

  it('skips the upper-bound check when the image count is unknown', () => {
    expect(normalizeImageIndices([0, 99], null)).toEqual([0, 99]);
  });

  it('drops every index when the product has no images', () => {
    expect(normalizeImageIndices([0, 1], 0)).toBeNull();
  });
});

describe('buildImportedVariationRecords', () => {
  const PRODUCT_ID = 'retail-product-1';

  const build = (
    productVariations: WholesaleVariationSource[],
    packVariations: WholesaleVariationSource[],
    copiedImageCount = 4,
  ) =>
    buildImportedVariationRecords({
      retailProductId: PRODUCT_ID,
      productVariations,
      packVariations,
      copiedImageCount,
    });

  it('returns nothing when the source product has no variations', () => {
    expect(build([], [])).toEqual([]);
  });

  it('copies product-level variations with no image link', () => {
    const records = build(
      [
        {
          variation_type: 'color',
          name: 'Red',
          value: '#FF0000',
          display_order: 1,
        },
      ],
      [],
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      product_id: PRODUCT_ID,
      variation_type: 'color',
      name: 'Red',
      value: '#FF0000',
      is_available: true,
      display_order: 1,
      image_indices: null,
    });
  });

  it('carries the pack variation image mapping across to retail', () => {
    const records = build(
      [],
      [
        {
          variation_type: 'color',
          name: 'Navy',
          value: '#000080',
          image_indices: [1, 2],
        },
      ],
    );
    expect(records[0].image_indices).toEqual([1, 2]);
  });

  it('upgrades a legacy single image_index to an array', () => {
    const records = build(
      [],
      [{ variation_type: 'color', name: 'Navy', image_index: 2 }],
    );
    expect(records[0].image_indices).toEqual([2]);
  });

  it('prefers image_indices over the legacy image_index', () => {
    const records = build(
      [],
      [
        {
          variation_type: 'color',
          name: 'Navy',
          image_index: 0,
          image_indices: [2, 3],
        },
      ],
    );
    expect(records[0].image_indices).toEqual([2, 3]);
  });

  it('backfills pack images onto a duplicate product-level variation', () => {
    // The regression this guards: product-level rows have no image column, so
    // deduping by type:name used to silently discard the pack's mapping.
    const records = build(
      [{ variation_type: 'color', name: 'Navy', display_order: 3 }],
      [
        {
          variation_type: 'color',
          name: 'Navy',
          display_order: 9,
          image_indices: [1],
        },
      ],
    );
    expect(records).toHaveLength(1);
    expect(records[0].display_order).toBe(3); // product level still owns order
    expect(records[0].image_indices).toEqual([1]);
  });

  it('does not overwrite an image link that is already set', () => {
    const records = build(
      [],
      [
        { variation_type: 'color', name: 'Navy', image_indices: [0] },
        { variation_type: 'color', name: 'Navy', image_indices: [3] },
      ],
    );
    expect(records).toHaveLength(1);
    expect(records[0].image_indices).toEqual([0]);
  });

  it('keeps variations of the same name but different types apart', () => {
    const records = build(
      [],
      [
        { variation_type: 'color', name: 'Large', image_indices: [0] },
        { variation_type: 'size', name: 'Large', image_indices: [1] },
      ],
    );
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.variation_type)).toEqual(['color', 'size']);
  });

  it('drops image links pointing past the images actually copied', () => {
    // Wholesale had 6 photos, only 2 were copied.
    const records = build(
      [],
      [{ variation_type: 'color', name: 'Navy', image_indices: [0, 5] }],
      2,
    );
    expect(records[0].image_indices).toEqual([0]);
  });

  it('yields a null link when a product is imported with no images', () => {
    const records = build(
      [],
      [{ variation_type: 'color', name: 'Navy', image_indices: [0, 1] }],
      0,
    );
    expect(records[0].image_indices).toBeNull();
  });

  it('preserves is_available=false from the source', () => {
    const records = build(
      [],
      [{ variation_type: 'color', name: 'Navy', is_available: false }],
    );
    expect(records[0].is_available).toBe(false);
  });

  it('defaults a missing display_order to 0 and a blank value to null', () => {
    const records = build([{ variation_type: 'size', name: 'M', value: '' }], []);
    expect(records[0].display_order).toBe(0);
    expect(records[0].value).toBeNull();
  });

  it('de-duplicates repeats within the product-level set itself', () => {
    const records = build(
      [
        { variation_type: 'color', name: 'Red', display_order: 0 },
        { variation_type: 'color', name: 'Red', display_order: 5 },
      ],
      [],
    );
    expect(records).toHaveLength(1);
    expect(records[0].display_order).toBe(0);
  });

  it('keeps product-level rows first, then appends pack-only rows in order', () => {
    const records = build(
      [{ variation_type: 'size', name: 'M' }],
      [
        { variation_type: 'color', name: 'Red', image_indices: [0] },
        { variation_type: 'color', name: 'Blue', image_indices: [1] },
      ],
    );
    expect(records.map((r) => r.name)).toEqual(['M', 'Red', 'Blue']);
  });
});
