import {
  sanitizeVariationImageIndices,
  mergeSocialColorOptions,
} from './social.service';

describe('sanitizeVariationImageIndices', () => {
  it('returns undefined when there is no link', () => {
    expect(sanitizeVariationImageIndices(undefined)).toBeUndefined();
    expect(sanitizeVariationImageIndices(null)).toBeUndefined();
    expect(sanitizeVariationImageIndices([])).toBeUndefined();
  });

  it('returns undefined for non-array input', () => {
    // variation_options is JSONB, so anything could arrive here.
    expect(sanitizeVariationImageIndices('0,1')).toBeUndefined();
    expect(sanitizeVariationImageIndices(3)).toBeUndefined();
    expect(sanitizeVariationImageIndices({ 0: 1 })).toBeUndefined();
  });

  it('keeps valid indices, sorted and de-duplicated', () => {
    expect(sanitizeVariationImageIndices([2, 0, 2])).toEqual([0, 2]);
  });

  it('coerces numeric strings, which JSON round-trips can produce', () => {
    expect(sanitizeVariationImageIndices(['1', '0'])).toEqual([0, 1]);
  });

  it('drops negative, fractional and non-numeric entries', () => {
    expect(sanitizeVariationImageIndices([-1, 1.5, 'x', null, 2])).toEqual([2]);
  });

  it('returns undefined when nothing survives, not an empty array', () => {
    expect(sanitizeVariationImageIndices([-1, 'x'])).toBeUndefined();
  });
});

describe('mergeSocialColorOptions', () => {
  it('returns nothing for an empty list', () => {
    expect(mergeSocialColorOptions([])).toEqual([]);
  });

  it('keeps a colour with no image link lean (no imageIndices key)', () => {
    const [option] = mergeSocialColorOptions([
      { label: 'Red', value: '#FF0000' },
    ]);
    expect(option).toEqual({ label: 'Red', value: '#ff0000' });
    expect('imageIndices' in option).toBe(false);
  });

  it('lowercases the hex swatch', () => {
    expect(mergeSocialColorOptions([{ label: 'Red', value: '#AABBCC' }])).toEqual(
      [{ label: 'Red', value: '#aabbcc' }],
    );
  });

  it('accepts 3-digit hex', () => {
    expect(mergeSocialColorOptions([{ label: 'Red', value: '#f00' }])).toEqual([
      { label: 'Red', value: '#f00' },
    ]);
  });

  it('falls back to black for an invalid swatch', () => {
    expect(
      mergeSocialColorOptions([{ label: 'Red', value: 'not-a-colour' }]),
    ).toEqual([{ label: 'Red', value: '#000000' }]);
    expect(mergeSocialColorOptions([{ label: 'Red', value: '' }])).toEqual([
      { label: 'Red', value: '#000000' },
    ]);
  });

  it('carries the image link through', () => {
    expect(
      mergeSocialColorOptions([
        { label: 'Navy', value: '#000080', imageIndices: [1, 0] },
      ]),
    ).toEqual([{ label: 'Navy', value: '#000080', imageIndices: [0, 1] }]);
  });

  it('adopts an image link from a duplicate label that has one', () => {
    // The regression: product-level rows carry no link, pack-level rows do.
    const options = mergeSocialColorOptions([
      { label: 'Navy', value: '#000080' },
      { label: 'Navy', value: '#111111', imageIndices: [2] },
    ]);
    expect(options).toHaveLength(1);
    expect(options[0]).toEqual({
      label: 'Navy',
      value: '#000080', // first swatch wins
      imageIndices: [2], // link is not lost
    });
  });

  it('does not overwrite an existing image link', () => {
    const options = mergeSocialColorOptions([
      { label: 'Navy', value: '#000080', imageIndices: [0] },
      { label: 'Navy', value: '#000080', imageIndices: [3] },
    ]);
    expect(options[0].imageIndices).toEqual([0]);
  });

  it('skips blank labels', () => {
    expect(
      mergeSocialColorOptions([
        { label: '   ', value: '#FF0000' },
        { label: 'Red', value: '#FF0000' },
      ]),
    ).toEqual([{ label: 'Red', value: '#ff0000' }]);
  });

  it('trims labels', () => {
    expect(
      mergeSocialColorOptions([{ label: '  Red  ', value: '#FF0000' }]),
    ).toEqual([{ label: 'Red', value: '#ff0000' }]);
  });

  it('preserves source order of distinct colours', () => {
    expect(
      mergeSocialColorOptions([
        { label: 'Blue', value: '#0000FF' },
        { label: 'Red', value: '#FF0000' },
      ]).map((o) => o.label),
    ).toEqual(['Blue', 'Red']);
  });

  it('discards an invalid image link rather than storing junk', () => {
    const [option] = mergeSocialColorOptions([
      { label: 'Navy', value: '#000080', imageIndices: [-1, 2.5] as number[] },
    ]);
    expect('imageIndices' in option).toBe(false);
  });
});

describe('sanitizeVariationImageIndices — falsy coercion traps', () => {
  // Number(null), Number(''), Number(false) and Number([]) are all 0, which
  // would silently link the product's FIRST photo. Each must be rejected.
  it.each([
    ['null', null],
    ['empty string', ''],
    ['whitespace', '   '],
    ['false', false],
    ['empty array', []],
  ])('rejects %s instead of reading it as index 0', (_label, value) => {
    expect(sanitizeVariationImageIndices([value])).toBeUndefined();
  });

  it('still accepts a genuine zero', () => {
    expect(sanitizeVariationImageIndices([0])).toEqual([0]);
    expect(sanitizeVariationImageIndices(['0'])).toEqual([0]);
  });

  it('rejects a decimal string', () => {
    expect(sanitizeVariationImageIndices(['1.5'])).toBeUndefined();
  });

  it('rejects a negative string', () => {
    expect(sanitizeVariationImageIndices(['-1'])).toBeUndefined();
  });
});
