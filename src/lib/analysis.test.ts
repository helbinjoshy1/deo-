import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeIngredients, type SkinProfile } from './analysis.ts';

const baseProfile: SkinProfile = {
  skinType: 'balanced',
  sensitive: false,
  concerns: [],
  allergies: '',
  audience: 'everyone',
  pregnant: false,
  shaving: false,
};

const profile = (overrides: Partial<SkinProfile> = {}): SkinProfile => ({ ...baseProfile, ...overrides });

test('an empty or separators-only label is limited', () => {
  for (const label of ['', '  ', ';,\n', 'Ingredients: ']) {
    const result = analyzeIngredients(label, profile());
    assert.equal(result.status, 'limited');
    assert.equal(result.ingredientCount, 0);
    assert.equal(result.recognizedCount, 0);
    assert.deepEqual(result.flags, []);
  }
});

test('parses INCI headings and comma, semicolon, and newline separators', () => {
  const result = analyzeIngredients('Ingredients: Aqua (Water), Glycerin;\nCeramide NP\r\nParfum (Fragrance)', profile({ sensitive: true }));
  assert.equal(result.ingredientCount, 4);
  assert.equal(result.flags.find((flag) => flag.id === 'fragrance')?.level, 'caution');
  assert.deepEqual(result.flags.find((flag) => flag.id === 'moisturizers')?.ingredients, ['Glycerin']);
  assert.deepEqual(result.flags.find((flag) => flag.id === 'ceramides')?.ingredients, ['Ceramide NP']);
});

test('normalizes case and known aliases without duplicating ingredients', () => {
  const result = analyzeIngredients('Water, AQUA, Glycerin, glycerol, Alcohol Denat.', profile());
  assert.equal(result.ingredientCount, 3);
  assert.deepEqual(result.flags.find((flag) => flag.id === 'drying-alcohol')?.ingredients, ['Alcohol Denat.']);
});

test('fatty alcohols and benzyl alcohol do not trigger drying-ethanol matching', () => {
  const result = analyzeIngredients('Cetyl Alcohol, Cetearyl Alcohol, Stearyl Alcohol, Benzyl Alcohol, Phenoxyethanol', profile({ sensitive: true }));
  assert.equal(result.flags.some((flag) => flag.id === 'drying-alcohol'), false);
  const fattyAlcohols = result.flags.find((flag) => flag.id === 'fatty-alcohols');
  assert.equal(fattyAlcohols?.ingredients.length, 3);
  assert.equal(fattyAlcohols?.level, 'note');
  assert.equal(fattyAlcohols?.sourceId, 'fda-alcohol');
  assert.equal(result.flags.some((flag) => flag.id === 'moisturizers'), false);
  assert.doesNotMatch(fattyAlcohols?.detail ?? '', /moisturiz|safe for/);
});

test('exact matching does not infer ingredients from partial names or marketing phrases', () => {
  const result = analyzeIngredients('Retinol alternative, Lavender extract, Glycerin-free blend, Salicylic Acid derivative', profile({ sensitive: true, pregnant: true }));
  assert.deepEqual(result.flags, []);
  assert.equal(result.status, 'limited');
});

test('sensitive profile elevates fragrance, essential oils, and ethanol cautions', () => {
  const result = analyzeIngredients('Water, Parfum, Lavandula Angustifolia (Lavender) Oil, Ethyl Alcohol', profile({ sensitive: true }));
  for (const id of ['fragrance', 'essential-oils', 'drying-alcohol']) {
    assert.equal(result.flags.find((flag) => flag.id === id)?.level, 'caution');
  }
  assert.equal(result.flags.find((flag) => flag.id === 'essential-oils')?.sourceId, 'fda-aromatherapy');
  assert.equal(result.status, 'review');
});

test('dry skin makes ethanol a consideration without treating every alcohol as drying', () => {
  const result = analyzeIngredients('Water, Alcohol Denat., Cetyl Alcohol', profile({ skinType: 'dry' }));
  assert.equal(result.flags.find((flag) => flag.id === 'drying-alcohol')?.level, 'caution');
  assert.deepEqual(result.flags.find((flag) => flag.id === 'drying-alcohol')?.ingredients, ['Alcohol Denat.']);
});

test('a selected dryness concern elevates drying alcohol even with another skin type', () => {
  const label = 'Water, Ethanol, Cetearyl Alcohol';
  const withoutConcern = analyzeIngredients(label, profile({ skinType: 'oily' }));
  const withConcern = analyzeIngredients(label, profile({ skinType: 'oily', concerns: ['Dryness'] }));
  assert.equal(withoutConcern.flags.find((flag) => flag.id === 'drying-alcohol')?.level, 'note');
  assert.equal(withConcern.flags.find((flag) => flag.id === 'drying-alcohol')?.level, 'caution');
  assert.match(withConcern.flags.find((flag) => flag.id === 'drying-alcohol')?.detail ?? '', /selected dryness/);
  assert.deepEqual(withConcern.flags.find((flag) => flag.id === 'drying-alcohol')?.ingredients, ['Ethanol']);
});

test('redness adds contextual irritation notes without diagnosing sensitive skin', () => {
  const result = analyzeIngredients('Water, Fragrance, Glycolic Acid, Retinol', profile({ concerns: ['Redness'] }));
  for (const id of ['fragrance', 'exfoliants', 'retinoids']) {
    const flag = result.flags.find((item) => item.id === id);
    assert.equal(flag?.level, 'note');
    assert.match(flag?.detail ?? '', /selected redness/);
    assert.match(flag?.detail ?? '', /does not identify the cause/);
  }
});

test('selected concerns add an effectiveness limitation without treatment claims', () => {
  const result = analyzeIngredients('Water, Niacinamide, Glycerin', profile({ concerns: ['Breakouts', 'Uneven tone', 'Fine lines'] }));
  assert.ok(result.limitations.some((limitation) => limitation.includes('does not establish that a product will improve your selected skin concerns')));
  assert.deepEqual(result.flags.map((flag) => flag.id), ['moisturizers']);
});

test('unspecified skin type makes an otherwise unflagged label limited', () => {
  const label = 'Water, Glycerin';
  assert.equal(analyzeIngredients(label, profile()).status, 'no-flags');
  const result = analyzeIngredients(label, profile({ skinType: 'unsure' }));
  assert.equal(result.status, 'limited');
  assert.match(result.summary, /Skin type is not yet specified/);
  assert.ok(result.limitations.some((limitation) => limitation.includes('skin type is not yet specified')));
  assert.equal(result.flags.find((flag) => flag.id === 'moisturizers')?.level, 'positive');
});

test('missing skin type does not hide caution or note flags', () => {
  const result = analyzeIngredients('Water, Parfum', profile({ skinType: 'unsure' }));
  assert.equal(result.status, 'review');
  assert.equal(result.flags.find((flag) => flag.id === 'fragrance')?.level, 'note');
  assert.ok(result.limitations.some((limitation) => limitation.includes('skin type is not yet specified')));
});

test('an exact custom allergy matches unknown ingredients', () => {
  const result = analyzeIngredients('Water, Sesamum Indicum Seed Oil', profile({ allergies: 'sesamum indicum seed oil' }));
  assert.deepEqual(result.flags.find((flag) => flag.id === 'allergy')?.ingredients, ['Sesamum Indicum Seed Oil']);
  assert.equal(result.flags.find((flag) => flag.id === 'allergy')?.level, 'caution');
});

test('custom allergy matching uses supported aliases', () => {
  const result = analyzeIngredients('Water, Nicotinamide, Parfum, Cocos Nucifera (Coconut) Oil', profile({ allergies: 'niacinamide; fragrance; coconut oil' }));
  assert.deepEqual(result.flags.find((flag) => flag.id === 'allergy')?.ingredients, ['Nicotinamide', 'Parfum', 'Cocos Nucifera (Coconut) Oil']);
});

test('custom allergies do not match substrings or infer botanical derivatives', () => {
  const result = analyzeIngredients('Cetyl Alcohol, Cocamidopropyl Betaine, Sodium Hyaluronate', profile({ allergies: 'alcohol, coconut oil, hyaluronic acid' }));
  assert.equal(result.flags.some((flag) => flag.id === 'allergy'), false);
  assert.ok(result.limitations.some((limitation) => limitation.includes('cross-reactions')));
});

test('pregnancy flags named retinoids and uses the pregnancy source', () => {
  const result = analyzeIngredients('Water, Retinyl Palmitate, Retinaldehyde', profile({ pregnant: true }));
  const retinoids = result.flags.find((flag) => flag.id === 'retinoids');
  assert.equal(retinoids?.level, 'caution');
  assert.equal(retinoids?.sourceId, 'aad-pregnancy');
  assert.match(retinoids?.detail ?? '', /avoiding retinoids during pregnancy/);
});

test('exfoliant and retinoid introductions have contextual guidance', () => {
  const result = analyzeIngredients('Water, Salicylic Acid, Retinol', profile());
  assert.equal(result.flags.find((flag) => flag.id === 'exfoliants')?.level, 'note');
  assert.match(result.flags.find((flag) => flag.id === 'exfoliants')?.detail ?? '', /strength depend on the formula/);
  assert.match(result.flags.find((flag) => flag.id === 'retinoids')?.detail ?? '', /introduce gradually/);
});

test('gender selection does not determine product safety', () => {
  const label = 'Water, Parfum, Glycolic Acid, Retinol, Glycerin';
  const everyone = analyzeIngredients(label, profile({ audience: 'everyone' }));
  assert.deepEqual(analyzeIngredients(label, profile({ audience: 'women' })), everyone);
  assert.deepEqual(analyzeIngredients(label, profile({ audience: 'men' })), everyone);
});

test('shaving observation adds a relevant flag for every audience', () => {
  const label = 'Water, Alcohol Denat., Glycolic Acid';
  assert.equal(analyzeIngredients(label, profile()).flags.some((flag) => flag.id === 'shaving'), false);
  const men = analyzeIngredients(label, profile({ audience: 'men', shaving: true }));
  const women = analyzeIngredients(label, profile({ audience: 'women', shaving: true }));
  assert.deepEqual(men, women);
  assert.deepEqual(men.flags.find((flag) => flag.id === 'shaving')?.ingredients, ['Alcohol Denat.', 'Glycolic Acid']);
  assert.equal(men.flags.find((flag) => flag.id === 'shaving')?.sourceId, 'aad-test');
  assert.match(men.flags.find((flag) => flag.id === 'shaving')?.detail ?? '', /cannot predict irritation/);
});

test('ceramides have a separately sourced moisturizer clue without suitability claims', () => {
  const result = analyzeIngredients('Water, Ceramide NP, Ceramide 3, Ceramide AP, Ceramide EOP', profile());
  const ceramides = result.flags.find((flag) => flag.id === 'ceramides');
  assert.equal(ceramides?.level, 'positive');
  assert.equal(ceramides?.sourceId, 'aad-moisturizer');
  assert.deepEqual(ceramides?.ingredients, ['Ceramide NP', 'Ceramide AP', 'Ceramide EOP']);
  assert.match(ceramides?.detail ?? '', /does not establish/);
  assert.equal(result.status, 'no-flags');
});

test('moisturizer clues do not claim finished-product safety or offer a numeric score', () => {
  const result = analyzeIngredients('Water, Glycerin, Sodium Hyaluronate, Ceramide NP', profile({ skinType: 'oily' }));
  assert.equal(result.status, 'no-flags');
  assert.equal(result.flags.find((flag) => flag.id === 'moisturizers')?.level, 'positive');
  assert.match(result.summary, /does not establish/);
  assert.equal('score' in result, false);
  assert.ok(result.limitations.some((limitation) => limitation.includes('concentrations')));
  assert.ok(result.limitations.some((limitation) => limitation.includes('face photo cannot diagnose')));
});

test('an unrecognized product name is limited rather than reassuring', () => {
  const result = analyzeIngredients('Example Glow Miracle Serum', profile());
  assert.equal(result.status, 'limited');
  assert.equal(result.recognizedCount, 0);
  assert.match(result.summary, /product name or link alone is not enough/);
});

test('a single recognized inert ingredient does not imply sufficient label coverage', () => {
  const result = analyzeIngredients('Water, Unlisted Ingredient One, Unlisted Ingredient Two', profile());
  assert.equal(result.ingredientCount, 3);
  assert.equal(result.recognizedCount, 1);
  assert.equal(result.status, 'limited');
  assert.match(result.summary, /incomplete coverage/);
  assert.match(result.summary, /current complete INCI list/);
  assert.ok(result.limitations.some((limitation) => limitation.includes('recognized 1 of 3')));
});

test('translated label names retain transparent limited coverage', () => {
  const result = analyzeIngredients('Eau, glycérine, alcool cétéarylique, huile de tournesol', profile());
  assert.equal(result.ingredientCount, 4);
  assert.equal(result.recognizedCount, 1);
  assert.equal(result.status, 'limited');
  assert.match(result.summary, /Translated names and aliases may be missed/);
  assert.ok(result.limitations.some((limitation) => limitation.includes('translated labels and aliases may be missed')));
});

test('a low-coverage mixed-language label preserves an identified caution', () => {
  const result = analyzeIngredients('Eau, Parfum, glycérine, alcool cétéarylique, huile de tournesol', profile({ sensitive: true }));
  assert.equal(result.ingredientCount, 5);
  assert.equal(result.recognizedCount, 2);
  assert.equal(result.status, 'review');
  assert.equal(result.flags.find((flag) => flag.id === 'fragrance')?.level, 'caution');
  assert.ok(result.limitations.some((limitation) => limitation.includes('recognized 2 of 5')));
});

test('half or more recognized names can have no flags while still disclosing unknown names', () => {
  const result = analyzeIngredients('Water, Glycerin, Unlisted Ingredient One, Unlisted Ingredient Two', profile());
  assert.equal(result.recognizedCount, 2);
  assert.equal(result.ingredientCount, 4);
  assert.equal(result.status, 'no-flags');
  assert.ok(result.limitations.some((limitation) => limitation.includes('recognized 2 of 4')));
  assert.match(result.summary, /does not establish/);
});

test('positive moisturizer clues cannot override low recognition coverage', () => {
  const result = analyzeIngredients('Glycerin, Unknown A, Unknown B, Unknown C', profile());
  assert.equal(result.recognizedCount, 1);
  assert.equal(result.status, 'limited');
  assert.equal(result.flags.find((flag) => flag.id === 'moisturizers')?.level, 'positive');
});

test('all flags reference one of the supplied evidence sources', () => {
  const result = analyzeIngredients('Water, Parfum, Tea Tree Oil, Alcohol, Cetyl Alcohol, Salicylic Acid, Retinol, Glycerin, Ceramide NP', profile({ sensitive: true, pregnant: true, shaving: true, allergies: 'fragrance' }));
  const sourceIds = new Set(['aad-test', 'aad-sensitive', 'fda-labels', 'aad-pregnancy', 'fda-aromatherapy', 'fda-alcohol', 'aad-moisturizer']);
  assert.ok(result.flags.every((flag) => sourceIds.has(flag.sourceId)));
  assert.equal(new Set(result.flags.map((flag) => flag.id)).size, result.flags.length);
});
