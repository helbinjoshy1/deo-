export type SkinType = 'dry' | 'oily' | 'combination' | 'balanced' | 'unsure';
export type Audience = 'everyone' | 'women' | 'men';

export interface SkinProfile {
  skinType: SkinType;
  sensitive: boolean;
  concerns: string[];
  allergies: string;
  audience: Audience;
  pregnant: boolean;
  shaving: boolean;
}

export interface Flag {
  id: string;
  level: 'caution' | 'note' | 'positive';
  title: string;
  detail: string;
  ingredients: string[];
  sourceId: string;
}

export interface Analysis {
  flags: Flag[];
  ingredientCount: number;
  recognizedCount: number;
  summary: string;
  status: 'review' | 'limited' | 'no-flags';
  limitations: string[];
}

type IngredientGroup =
  | 'fragrance'
  | 'essential-oil'
  | 'drying-alcohol'
  | 'exfoliant'
  | 'retinoid'
  | 'moisturizer'
  | 'ceramide'
  | 'fatty-alcohol'
  | 'other';

interface IngredientDefinition {
  id: string;
  group: IngredientGroup;
  aliases: string[];
}

interface ParsedIngredient {
  label: string;
  key: string;
  definition?: IngredientDefinition;
}

// Whole-token aliases prevent e.g. cetyl alcohol from matching ethyl alcohol.
// This is a small, transparent checklist, not a complete ingredient database.
const definitions: IngredientDefinition[] = [
  { id: 'water', group: 'other', aliases: ['water', 'aqua', 'eau', 'aqua (water)', 'water (aqua)', 'water (aqua/eau)', 'aqua/water/eau'] },
  { id: 'fragrance', group: 'fragrance', aliases: ['fragrance', 'parfum', 'perfume', 'parfum (fragrance)', 'fragrance (parfum)'] },
  { id: 'lavender-oil', group: 'essential-oil', aliases: ['lavender oil', 'lavandula angustifolia oil', 'lavandula angustifolia (lavender) oil', 'lavandula angustifolia (lavender) flower oil'] },
  { id: 'tea-tree-oil', group: 'essential-oil', aliases: ['tea tree oil', 'melaleuca alternifolia leaf oil', 'melaleuca alternifolia (tea tree) leaf oil'] },
  { id: 'peppermint-oil', group: 'essential-oil', aliases: ['peppermint oil', 'mentha piperita oil', 'mentha piperita (peppermint) oil'] },
  { id: 'eucalyptus-oil', group: 'essential-oil', aliases: ['eucalyptus oil', 'eucalyptus globulus leaf oil', 'eucalyptus globulus (eucalyptus) leaf oil'] },
  { id: 'rosemary-oil', group: 'essential-oil', aliases: ['rosemary oil', 'rosmarinus officinalis leaf oil', 'rosmarinus officinalis (rosemary) leaf oil'] },
  { id: 'lemon-peel-oil', group: 'essential-oil', aliases: ['lemon peel oil', 'citrus limon peel oil', 'citrus limon (lemon) peel oil'] },
  { id: 'orange-peel-oil', group: 'essential-oil', aliases: ['orange peel oil', 'citrus aurantium dulcis peel oil', 'citrus aurantium dulcis (orange) peel oil'] },
  { id: 'ethanol', group: 'drying-alcohol', aliases: ['alcohol', 'ethanol', 'ethyl alcohol', 'alcohol denat', 'denatured alcohol', 'sd alcohol 40', 'sd alcohol 40-b'] },
  { id: 'isopropyl-alcohol', group: 'drying-alcohol', aliases: ['isopropyl alcohol', 'isopropanol'] },
  { id: 'glycolic-acid', group: 'exfoliant', aliases: ['glycolic acid'] },
  { id: 'lactic-acid', group: 'exfoliant', aliases: ['lactic acid'] },
  { id: 'salicylic-acid', group: 'exfoliant', aliases: ['salicylic acid'] },
  { id: 'mandelic-acid', group: 'exfoliant', aliases: ['mandelic acid'] },
  { id: 'gluconolactone', group: 'exfoliant', aliases: ['gluconolactone'] },
  { id: 'lactobionic-acid', group: 'exfoliant', aliases: ['lactobionic acid'] },
  { id: 'retinol', group: 'retinoid', aliases: ['retinol'] },
  { id: 'retinal', group: 'retinoid', aliases: ['retinal', 'retinaldehyde'] },
  { id: 'retinyl-palmitate', group: 'retinoid', aliases: ['retinyl palmitate'] },
  { id: 'retinyl-acetate', group: 'retinoid', aliases: ['retinyl acetate'] },
  { id: 'retinyl-propionate', group: 'retinoid', aliases: ['retinyl propionate'] },
  { id: 'tretinoin', group: 'retinoid', aliases: ['tretinoin', 'retinoic acid', 'all-trans retinoic acid'] },
  { id: 'adapalene', group: 'retinoid', aliases: ['adapalene'] },
  { id: 'tazarotene', group: 'retinoid', aliases: ['tazarotene'] },
  { id: 'glycerin', group: 'moisturizer', aliases: ['glycerin', 'glycerine', 'glycerol'] },
  { id: 'hyaluronic-acid', group: 'moisturizer', aliases: ['hyaluronic acid'] },
  { id: 'sodium-hyaluronate', group: 'moisturizer', aliases: ['sodium hyaluronate'] },
  { id: 'petrolatum', group: 'moisturizer', aliases: ['petrolatum', 'petroleum jelly'] },
  { id: 'dimethicone', group: 'moisturizer', aliases: ['dimethicone'] },
  { id: 'ceramide-np', group: 'ceramide', aliases: ['ceramide np', 'ceramide 3'] },
  { id: 'ceramide-ap', group: 'ceramide', aliases: ['ceramide ap', 'ceramide 6 ii', 'ceramide 6-ii'] },
  { id: 'ceramide-eop', group: 'ceramide', aliases: ['ceramide eop', 'ceramide 1'] },
  { id: 'cetyl-alcohol', group: 'fatty-alcohol', aliases: ['cetyl alcohol'] },
  { id: 'cetearyl-alcohol', group: 'fatty-alcohol', aliases: ['cetearyl alcohol'] },
  { id: 'stearyl-alcohol', group: 'fatty-alcohol', aliases: ['stearyl alcohol'] },
  { id: 'niacinamide', group: 'other', aliases: ['niacinamide', 'nicotinamide'] },
  { id: 'coconut-oil', group: 'other', aliases: ['coconut oil', 'cocos nucifera oil', 'cocos nucifera (coconut) oil'] },
  { id: 'benzyl-alcohol', group: 'other', aliases: ['benzyl alcohol'] },
  { id: 'phenoxyethanol', group: 'other', aliases: ['phenoxyethanol'] },
  { id: 'sodium-benzoate', group: 'other', aliases: ['sodium benzoate'] },
  { id: 'potassium-sorbate', group: 'other', aliases: ['potassium sorbate'] },
  { id: 'propylene-glycol', group: 'other', aliases: ['propylene glycol'] },
  { id: 'butylene-glycol', group: 'other', aliases: ['butylene glycol'] },
  { id: 'caprylic-capric-triglyceride', group: 'other', aliases: ['caprylic/capric triglyceride', 'caprylic capric triglyceride'] },
  { id: 'carbomer', group: 'other', aliases: ['carbomer'] },
  { id: 'sodium-hydroxide', group: 'other', aliases: ['sodium hydroxide'] },
];

function normalize(token: string): string {
  return token
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[()./\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const aliasIndex = new Map(
  definitions.flatMap((definition) =>
    definition.aliases.map((alias) => [normalize(alias), definition] as const),
  ),
);

function parseList(text: string): ParsedIngredient[] {
  const labelText = text.trim().replace(/^(?:ingredients?|inci)\s*:\s*/i, '');
  const unique = new Map<string, ParsedIngredient>();

  for (const part of labelText.split(/[,;\n\r]+/)) {
    const label = part.trim();
    const key = normalize(label);
    if (!key) continue;
    const definition = aliasIndex.get(key);
    const identity = definition?.id ?? key;
    if (!unique.has(identity)) unique.set(identity, { label, key, definition });
  }

  return [...unique.values()];
}

const baseLimitations = [
  'Ingredient names do not reveal concentrations, pH, the complete formulation, or how the finished product will affect your skin.',
  'This checklist covers selected ingredients and may miss aliases, derivatives, or ingredients outside its database. No flags does not mean a product is safe for you.',
  'This is educational guidance, not a diagnosis or a dermatologist review. A face photo cannot diagnose a skin condition or establish product compatibility.',
];

export function analyzeIngredients(ingredientsText: string, profile: SkinProfile): Analysis {
  const ingredients = parseList(ingredientsText);
  const recognizedCount = ingredients.filter((ingredient) => ingredient.definition).length;
  const flags: Flag[] = [];
  const limitations = [...baseLimitations];
  const concerns = new Set(profile.concerns.map(normalize).filter(Boolean));
  const drynessConcern = concerns.has('dryness');
  const rednessConcern = concerns.has('redness');
  const rednessContext = rednessConcern
    ? ' You selected redness as a concern, so possible irritation is worth reviewing; this does not identify the cause of redness or diagnose sensitive skin.'
    : '';

  if (concerns.size > 0) {
    limitations.push('An ingredient list does not establish that a product will improve your selected skin concerns. Effectiveness depends on the finished formula and clinical evidence.');
  }
  if (profile.skinType === 'unsure') {
    limitations.push('Your skin type is not yet specified, so this checklist has less context for assessing ingredient suitability.');
  }
  if (recognizedCount < ingredients.length) {
    limitations.push(`This checklist recognized ${recognizedCount} of ${ingredients.length} listed ingredient names. Unknown names are not assessed; translated labels and aliases may be missed. Check the current full INCI list on the product label.`);
  }

  if (ingredients.length === 0) {
    return {
      flags,
      ingredientCount: 0,
      recognizedCount: 0,
      summary: 'Add the full ingredient list from the product label to run this checklist.',
      status: 'limited',
      limitations,
    };
  }

  const inGroup = (group: IngredientGroup) =>
    ingredients.filter((ingredient) => ingredient.definition?.group === group).map((ingredient) => ingredient.label);

  const allergies = parseList(profile.allergies);
  if (allergies.length > 0) {
    const allergyKeys = new Set(allergies.map((allergy) => allergy.definition?.id ?? allergy.key));
    const matches = ingredients
      .filter((ingredient) => allergyKeys.has(ingredient.definition?.id ?? ingredient.key))
      .map((ingredient) => ingredient.label);

    limitations.push('Allergy matching uses exact names and known aliases only. It cannot rule out related ingredients, cross-reactions, or undeclared components.');
    if (matches.length > 0) {
      flags.push({
        id: 'allergy',
        level: 'caution',
        title: 'A named allergy matches this label',
        detail: 'An ingredient matches the allergy you entered. Avoid using the product until you have checked the full label and discussed it with your clinician. This is a name match, not an allergy test.',
        ingredients: matches,
        sourceId: 'fda-labels',
      });
    }
  }

  const fragrance = inGroup('fragrance');
  if (fragrance.length > 0) {
    flags.push({
      id: 'fragrance',
      level: profile.sensitive ? 'caution' : 'note',
      title: profile.sensitive ? 'Fragrance and your sensitive-skin profile' : 'Fragrance is listed',
      detail: profile.sensitive
        ? 'Fragrance can irritate sensitive skin. Consider a fragrance-free alternative and check the full label; “unscented” does not always mean fragrance-free.'
        : 'Fragrance can cause irritation or allergy in some people. The label may not name every component of a fragrance blend.' + rednessContext,
      ingredients: fragrance,
      sourceId: profile.sensitive ? 'aad-sensitive' : 'fda-labels',
    });
  }

  const essentialOils = inGroup('essential-oil');
  if (essentialOils.length > 0) {
    flags.push({
      id: 'essential-oils',
      level: profile.sensitive ? 'caution' : 'note',
      title: 'Scented plant oils to review',
      detail: 'These plant oils can add scent and may irritate or trigger allergy in some people, particularly with sensitive skin. A natural origin does not establish tolerance.',
      ingredients: essentialOils,
      sourceId: 'fda-aromatherapy',
    });
  }

  const dryingAlcohols = inGroup('drying-alcohol');
  if (dryingAlcohols.length > 0) {
    flags.push({
      id: 'drying-alcohol',
      level: profile.sensitive || profile.skinType === 'dry' || drynessConcern ? 'caution' : 'note',
      title: 'Alcohol that may feel drying',
      detail: 'Ethanol or isopropyl alcohol may feel drying or irritating, depending on amount and formulation. This flag covers the named alcohols only; the ingredient amounts and final formula are unknown.'
        + (drynessConcern ? ' You selected dryness as a concern, which makes this worth reviewing.' : ''),
      ingredients: dryingAlcohols,
      sourceId: 'aad-sensitive',
    });
  }

  const fattyAlcohols = inGroup('fatty-alcohol');
  if (fattyAlcohols.length > 0) {
    flags.push({
      id: 'fatty-alcohols',
      level: 'note',
      title: 'Fatty alcohols differ from ethyl alcohol',
      detail: 'Cetyl, cetearyl, and stearyl alcohol are chemically different from ethyl alcohol. An “alcohol-free” label may still contain these ingredients. Their names do not establish finished-product suitability or individual tolerance.',
      ingredients: fattyAlcohols,
      sourceId: 'fda-alcohol',
    });
  }

  const exfoliants = inGroup('exfoliant');
  if (exfoliants.length > 0) {
    flags.push({
      id: 'exfoliants',
      level: profile.sensitive ? 'caution' : 'note',
      title: 'Exfoliating ingredients: introduce carefully',
      detail: 'These ingredients can be used as exfoliants, but their role and strength depend on the formula. They may irritate skin. Follow product directions, introduce one new product at a time, and test a small area first.' + rednessContext,
      ingredients: exfoliants,
      sourceId: 'aad-test',
    });
  }

  const retinoids = inGroup('retinoid');
  if (retinoids.length > 0) {
    flags.push({
      id: 'retinoids',
      level: profile.pregnant || profile.sensitive ? 'caution' : 'note',
      title: profile.pregnant ? 'Pregnancy and retinoids' : 'Retinoids: introduce carefully',
      detail: profile.pregnant
        ? 'AAD guidance recommends avoiding retinoids during pregnancy. Pause use and review the product with your clinician; this label check cannot assess exposure.'
        : 'Retinoids can irritate skin. Follow the label or prescriber’s directions, introduce gradually, and test a small area first. An ingredient name alone does not establish the product’s strength.' + rednessContext,
      ingredients: retinoids,
      sourceId: profile.pregnant ? 'aad-pregnancy' : 'aad-test',
    });
  }

  if (profile.shaving && (dryingAlcohols.length > 0 || exfoliants.length > 0 || retinoids.length > 0)) {
    flags.push({
      id: 'shaving',
      level: 'note',
      title: 'Consider irritation around shaving',
      detail: 'If shaving leaves your skin irritated, take extra care when introducing this product. Follow directions and test a small area first; this checklist cannot predict irritation after shaving. This depends on your skin and shaving routine, not gender.',
      ingredients: [...dryingAlcohols, ...exfoliants, ...retinoids],
      sourceId: 'aad-test',
    });
  }

  const moisturizers = inGroup('moisturizer');
  if (moisturizers.length > 0) {
    flags.push({
      id: 'moisturizers',
      level: 'positive',
      title: 'Moisturizing ingredients are listed',
      detail: 'These ingredients commonly help a formula retain moisture or soften skin. Their presence is a useful label clue; it does not prove the finished product is suitable, non-comedogenic, or free from irritation.',
      ingredients: moisturizers,
      sourceId: 'aad-sensitive',
    });
  }

  const ceramides = inGroup('ceramide');
  if (ceramides.length > 0) {
    flags.push({
      id: 'ceramides',
      level: 'positive',
      title: 'Ceramides are listed',
      detail: 'Ceramides are ingredients used in moisturizers to help skin retain moisture. Their presence does not establish the finished product’s concentration, effectiveness, or suitability for your skin.',
      ingredients: ceramides,
      sourceId: 'aad-moisturizer',
    });
  }

  const needsReview = flags.some((flag) => flag.level === 'caution' || flag.level === 'note');
  const enoughCoverage = recognizedCount >= ingredients.length / 2;
  const status = needsReview ? 'review' : enoughCoverage && profile.skinType !== 'unsure' ? 'no-flags' : 'limited';
  const summary = status === 'review'
    ? 'There are ingredient considerations to review against your profile. This is not a prediction of how your skin will react.'
    : status === 'limited'
      ? !enoughCoverage
        ? recognizedCount === 0
          ? 'This checklist did not recognize the supplied names. Paste the current complete INCI list from the label; a product name or link alone is not enough. Translated names and aliases may be missed.'
          : `Only ${recognizedCount} of ${ingredients.length} ingredient names were recognized, so this checklist has incomplete coverage. Translated names and aliases may be missed. Paste the current complete INCI list from the product label.`
        : 'Skin type is not yet specified, so this ingredient check has limited context. No caution flags were found, but suitability has not been established.'
      : 'No caution flags were found by this limited checklist. This does not establish that the product is safe or suitable for you.';

  return { flags, ingredientCount: ingredients.length, recognizedCount, summary, status, limitations };
}
