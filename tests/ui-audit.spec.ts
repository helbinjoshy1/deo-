import { expect, test, type Page } from '@playwright/test';

// Synthetic, explicitly named fixtures exercise UI states only. These labels
// must not be used as evidence of a real product's ingredients or API uptime.
const fixtures = [
  { id: '9000000000001', name: 'QA fixture fragrance cream', brand: 'Test fixture', ingredients: 'Aqua, Glycerin, Parfum', sourceUrl: 'https://world.openbeautyfacts.org/product/9000000000001', updatedAt: '2026-05-20T07:59:58.000Z' },
  { id: '9000000000002', name: 'QA fixture retinoid serum', brand: '', ingredients: 'Aqua, Retinol', sourceUrl: 'https://world.openbeautyfacts.org/product/9000000000002' },
  { id: '9000000000003', name: 'QA fixture missing label', brand: 'Test fixture', ingredients: '', sourceUrl: 'https://world.openbeautyfacts.org/product/9000000000003' },
];

async function label(page: Page, ingredients: string, name = 'QA manual label') {
  await page.getByRole('tab', { name: 'Paste ingredients' }).click();
  await page.getByLabel('Product name', { exact: false }).fill(name);
  await page.getByLabel('Full ingredient list').fill(ingredients);
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  const result = page.getByRole('region', { name, exact: true });
  await expect(result).toBeVisible();
  return result;
}

async function generatedImage(page: Page, type: 'image/png' | 'image/jpeg' | 'image/webp') {
  const base64 = await page.evaluate((mime) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 400;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#decfc3'; context.fillRect(0, 0, 320, 400);
    return canvas.toDataURL(mime).split(',')[1];
  }, type);
  return Buffer.from(base64, 'base64');
}

test('header, hero and footer navigation reach their intended sections', async ({ page }) => {
  await page.goto('/');
  for (const [name, target, heading] of [
    ['Product check', 'workspace', 'Let’s find a little clarity.'],
    ['How it works', 'how-it-works', 'Less guessing. More understanding.'],
    ['Our sources', 'sources', 'Sources you can explore.'],
    ['Check a product', 'workspace', 'Let’s find a little clarity.'],
    ['Back to your skin', 'workspace', 'Let’s find a little clarity.'],
  ]) {
    await page.getByRole('link', { name, exact: name !== 'Our sources' }).click();
    await expect(page).toHaveURL(new RegExp(`#${target}$`));
    await expect(page.getByRole('heading', { name: new RegExp(heading.replace(/[.?]/g, '\\$&')) })).toBeInViewport();
  }
  await page.getByRole('link', { name: 'Skinwise home' }).click();
  await expect(page.getByRole('heading', { name: /Good for the hype/ })).toBeInViewport();
  await page.locator('footer .brand').click();
  await expect(page.getByRole('heading', { name: /Good for the hype/ })).toBeInViewport();
});

test('both example entry points populate an editable, clearly illustrative comparison', async ({ page }) => {
  for (const name of ['Try an example', 'See an example comparison']) {
    await page.goto('/');
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Paste ingredients' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Product name', { exact: false })).toHaveValue('Daily Barrier Moisturizer');
    await expect(page.getByLabel('Full ingredient list')).not.toBeEmpty();
    await expect(page.getByText('Illustrative formula — this is not a verified real product.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Daily Barrier Moisturizer', exact: true })).toContainText('Example formula');
  }
});

test('product tabs support arrows, Home, End and a single keyboard tab stop', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('tab', { name: 'Find a product' });
  const manual = page.getByRole('tab', { name: 'Paste ingredients' });
  await search.focus();
  await page.keyboard.press('ArrowRight');
  await expect(manual).toBeFocused();
  await expect(manual).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Paste ingredients' })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(manual).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(search).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(manual).toBeFocused();
  await expect(search).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Product name', { exact: false })).toBeFocused();
});

test('all audience and skin choices are selectable and update the current comparison', async ({ page }) => {
  await page.goto('/');
  const result = await label(page, 'Aqua, Glycerin, Alcohol Denat.');
  for (const audience of ['Women', 'Men', 'Everyone']) {
    const control = page.getByRole('button', { name: audience, exact: true });
    await control.focus(); await page.keyboard.press('Space');
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await expect(result.getByRole('heading', { name: 'Alcohol that may feel drying' })).toBeVisible();
  }
  for (const name of ['Dry Often feels tight', 'Oily Often looks shiny', 'Combination A bit of both', 'Balanced Usually comfortable', 'Not sure That’s okay, too']) {
    const control = name.startsWith('Not sure')
      ? page.getByRole('button', { name: /Not sure/ })
      : page.getByRole('button', { name, exact: true });
    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.skin-type[aria-pressed="true"]')).toHaveCount(1);
    if (name.startsWith('Dry ')) await expect(result.getByText('1 point to review', { exact: true })).toBeVisible();
    else await expect(result.getByText('1 point to review', { exact: true })).toHaveCount(0);
  }
});

test('every concern chip toggles and sensitive, dryness and redness observations affect guidance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Oily Often looks shiny', exact: true }).click();
  const result = await label(page, 'Aqua, Alcohol Denat., Parfum, Glycolic Acid, Retinol');
  for (const name of ['Breakouts', 'Dryness', 'Redness', 'Uneven tone', 'Fine lines']) {
    const control = page.getByRole('button', { name, exact: true });
    await control.click(); await expect(control).toHaveAttribute('aria-pressed', 'true');
    if (name === 'Dryness') await expect(result).toContainText('You selected dryness as a concern');
    if (name === 'Redness') await expect(result).toContainText('You selected redness as a concern');
    await control.click(); await expect(control).toHaveAttribute('aria-pressed', 'false');
  }
  const sensitive = page.getByRole('checkbox', { name: /My skin can be sensitive/ });
  await sensitive.check();
  await expect(result.getByRole('heading', { name: 'Fragrance and your sensitive-skin profile' })).toBeVisible();
  await page.getByText('My skin can be sensitive', { exact: true }).click();
  await expect(sensitive).not.toBeChecked();
  await expect(result.getByRole('heading', { name: 'Fragrance is listed' })).toBeVisible();
});

test('allergy edits and optional shaving and pregnancy controls update existing results', async ({ page }) => {
  await page.goto('/');
  const result = await label(page, 'Aqua, Glycerin, Parfum, Retinol, Alcohol Denat.');
  await page.getByLabel('Known ingredient allergies').fill('glycerol, fragrance');
  await expect(result.getByRole('heading', { name: 'A named allergy matches this label' })).toBeVisible();
  await page.getByLabel('Known ingredient allergies').fill('');
  await expect(result.getByRole('heading', { name: 'A named allergy matches this label' })).toHaveCount(0);
  await page.getByText('A little more context', { exact: true }).click();
  const shaving = page.getByRole('checkbox', { name: 'My skin gets irritated after shaving', exact: true });
  const pregnant = page.getByRole('checkbox', { name: /Pregnant or planning pregnancy/ });
  await shaving.check(); await pregnant.check();
  await expect(result.getByRole('heading', { name: 'Consider irritation around shaving' })).toBeVisible();
  await expect(result.getByRole('heading', { name: 'Pregnancy and retinoids' })).toBeVisible();
  await page.getByText('My skin gets irritated after shaving', { exact: true }).click();
  await pregnant.focus(); await page.keyboard.press('Space');
  await expect(shaving).not.toBeChecked(); await expect(pregnant).not.toBeChecked();
  await expect(result.getByRole('heading', { name: 'Consider irritation around shaving' })).toHaveCount(0);
  await expect(result.getByRole('heading', { name: 'Retinoids: introduce carefully' })).toBeVisible();
});

test('empty manual input errors recover, Enter submits and editing invalidates old results', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Paste ingredients' }).click();
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  await expect(page.getByRole('alert')).toContainText('Add the ingredient list');
  await page.getByLabel('Full ingredient list').fill('  ');
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  await expect(page.getByRole('alert')).toContainText('Add the ingredient list');
  await page.getByLabel('Full ingredient list').fill('Ingredients: Aqua; Glycerin\nCeramide NP');
  await page.getByLabel('Product name', { exact: false }).press('Enter');
  const result = page.getByRole('region', { name: 'Your product', exact: true });
  await expect(result).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(result).toContainText('3 ingredients listed');
  await page.getByLabel('Product name', { exact: false }).fill('Renamed manual product');
  await expect(result).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  await expect(page.getByRole('region', { name: 'Renamed manual product', exact: true })).toBeVisible();
  await page.getByLabel('Full ingredient list').fill('Aqua, Parfum');
  await expect(page.getByRole('region', { name: 'Renamed manual product', exact: true })).toHaveCount(0);
});

test('unrecognized labels remain limited and comparison limitations open and close', async ({ page }) => {
  await page.goto('/');
  const result = await label(page, 'Unknown QA ingredient one, Unknown QA ingredient two');
  await expect(result).toContainText('0 of 2 names recognized');
  await expect(result).toContainText('This checklist did not recognize the supplied names');
  const disclosure = result.getByText('What this comparison can and can’t tell you', { exact: false });
  await disclosure.click();
  await expect(result.getByText(/Ingredient names do not reveal concentrations/)).toBeVisible();
  await disclosure.click();
  await expect(result.getByText(/Ingredient names do not reveal concentrations/)).toBeHidden();
});

test('empty and invalid search input recover without requiring upstream access', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search products' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a product name, barcode, or link first');
  for (const query of ['a', '123', 'https://localhost/product/cream', 'javascript:alert(1)']) {
    await page.getByLabel('Product name, barcode, or link').fill(query);
    await page.getByRole('button', { name: 'Search products' }).click();
    await expect(page.getByRole('alert')).toContainText('We couldn’t look up this product');
    await expect(page.getByRole('button', { name: 'Search products' })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Paste the label instead' }).click();
  await expect(page.getByRole('tab', { name: 'Paste ingredients' })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Full ingredient list').fill('Aqua, Glycerin');
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  await expect(page.getByRole('region', { name: 'Your product', exact: true })).toBeVisible();
});

test('mocked name, URL and barcode searches allow switching between matched products', async ({ page }) => {
  const observed: string[] = [];
  await page.route('**/api/products?*', route => {
    observed.push(new URL(route.request().url()).searchParams.get('q')!);
    return route.fulfill({ json: { products: fixtures, notice: 'QA test fixture only. Verify your own packaging.' } });
  });
  await page.goto('/');
  const inputs = ['qa cream', 'https://shop.example.com/products/qa-cream', '9000000000001'];
  for (const query of inputs) {
    await page.getByLabel('Product name, barcode, or link').fill(query);
    await page.getByLabel('Product name, barcode, or link').press('Enter');
    await page.getByRole('button', { name: /QA fixture fragrance cream.*Ingredient label available/ }).click();
    await expect(page.getByRole('link', { name: 'View source' })).toHaveAttribute('href', fixtures[0].sourceUrl);
    await page.getByRole('button', { name: 'Compare with my profile' }).click();
    await expect(page.getByRole('region', { name: fixtures[0].name, exact: true })).toContainText('Fragrance is listed');
    await page.getByRole('button', { name: /QA fixture retinoid serum.*Ingredient label available/ }).click();
    await expect(page.getByRole('region', { name: fixtures[0].name, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Compare with my profile' }).click();
    await expect(page.getByRole('region', { name: fixtures[1].name, exact: true })).toContainText('Retinoids: introduce carefully');
  }
  expect(observed).toEqual(inputs);
});

test('mocked missing-label and empty-result responses retain the manual comparison path', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/products?*', route => route.fulfill({ json: ++calls === 1
    ? { products: [fixtures[2]], notice: 'QA missing label fixture.' }
    : { products: [], notice: 'No matching products were found. Paste your package label.' } }));
  await page.goto('/');
  await page.getByLabel('Product name, barcode, or link').fill('missing label fixture');
  await page.getByRole('button', { name: 'Search products' }).click();
  await page.getByRole('button', { name: /QA fixture missing label.*Ingredient label missing/ }).click();
  await page.getByRole('button', { name: 'Add the label yourself' }).click();
  await expect(page.getByLabel('Product name', { exact: false })).toHaveValue(fixtures[2].name);
  await expect(page.getByLabel('Full ingredient list')).toBeEmpty();
  await page.getByLabel('Full ingredient list').fill('Aqua, Glycerin');
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  await expect(page.getByRole('region', { name: fixtures[2].name, exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Find a product' }).click();
  await page.getByLabel('Product name, barcode, or link').fill('empty result fixture');
  await page.getByRole('button', { name: 'Search products' }).click();
  await expect(page.getByRole('status')).toContainText('No matching products were found');
  await expect(page.locator('.product-option')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'See an example comparison' })).toBeVisible();
});

test('mocked unavailable, rate-limited and malformed responses recover without fabricated products', async ({ page }) => {
  const responses = [
    { status: 503, body: JSON.stringify({ error: 'QA catalog unavailable. Paste the label.' }) },
    { status: 429, body: JSON.stringify({ error: 'QA rate limit. Please wait.' }) },
    { status: 200, body: 'not JSON' },
  ];
  let index = 0;
  await page.route('**/api/products?*', route => route.fulfill({ ...responses[index++], contentType: 'application/json' }));
  await page.goto('/');
  for (const query of ['unavailable fixture', 'limited fixture', 'malformed fixture']) {
    await page.getByLabel('Product name, barcode, or link').fill(query);
    await page.getByRole('button', { name: 'Search products' }).click();
    await expect(page.getByRole('alert')).toContainText('We couldn’t look up this product');
    await expect(page.locator('.product-option')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Search products' })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Paste the label instead' }).click();
  await page.getByLabel('Full ingredient list').fill('Aqua, Glycerin');
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  await expect(page.getByRole('region', { name: 'Your product', exact: true })).toBeVisible();
});

test('all reference-card and matched-rule links expose public HTTPS destinations safely', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('checkbox', { name: /My skin can be sensitive/ }).check();
  await page.getByLabel('Known ingredient allergies').fill('glycerol');
  await page.getByText('A little more context', { exact: true }).click();
  await page.getByRole('checkbox', { name: /Pregnant or planning pregnancy/ }).check();
  await page.getByRole('checkbox', { name: 'My skin gets irritated after shaving', exact: true }).check();
  const result = await label(page, 'Aqua, Glycerin, Parfum, Tea Tree Oil, Alcohol Denat., Glycolic Acid, Retinol, Ceramide NP, Cetearyl Alcohol');
  const links = page.locator('.source-cards a, .ingredient-flags .source-link');
  const destinations = new Set<string>();
  for (const link of await links.all()) {
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^https:\/\//);
    expect(new URL(href!).hostname).toMatch(/^(?:www\.(?:aad|fda)\.org|www\.fda\.gov|world\.openbeautyfacts\.org|github\.com)$/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noreferrer/);
    destinations.add(href!);
  }
  expect(destinations.size).toBeGreaterThanOrEqual(8);
  await expect(result).toContainText('No dermatologist has reviewed this comparison');
});

for (const [extension, mime] of [['png', 'image/png'], ['jpg', 'image/jpeg'], ['webp', 'image/webp']] as const) {
  test(`${extension.toUpperCase()} photo preview, removal and reselection work without network upload`, async ({ page }) => {
    await page.goto('/'); await page.waitForLoadState('networkidle');
    const requests: string[] = [];
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    const buffer = await generatedImage(page, mime);
    const input = page.getByLabel('Choose a face photo');
    const fixture = { name: `qa-generated-reference.${extension}`, mimeType: mime, buffer };
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add a photo' }).click();
    await (await chooser).setFiles(fixture);
    const preview = page.getByRole('img', { name: 'Your private skin reference' });
    await expect(preview).toHaveAttribute('src', /^blob:/);
    await expect(page.getByText('320 × 400 pixels', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove photo' }).click();
    await expect(preview).toHaveCount(0);
    await input.setInputFiles(fixture);
    await expect(preview).toBeVisible();
    await page.getByRole('button', { name: 'Remove photo' }).click();
    expect(requests).toEqual([]);
  });
}

test('wrong-type, oversized and corrupt photos show actionable errors and allow valid recovery', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Choose a face photo');
  await input.setInputFiles({ name: 'qa-text.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') });
  await expect(page.getByRole('alert')).toContainText('Choose a JPG, PNG, or WebP photo');
  await input.setInputFiles({ name: 'qa-oversized.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toContainText('Please choose a photo smaller than 10 MB');
  await input.setInputFiles({ name: 'qa-corrupt.png', mimeType: 'image/png', buffer: Buffer.from('corrupt image fixture') });
  await expect(page.getByRole('alert')).toContainText('This photo could not be opened');
  await expect(page.getByRole('button', { name: 'Add a photo' })).toBeVisible();
  await input.setInputFiles({ name: 'qa-valid.png', mimeType: 'image/png', buffer: await generatedImage(page, 'image/png') });
  await expect(page.getByRole('img', { name: 'Your private skin reference' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('hidden photo input does not create an invisible keyboard stop', async ({ page }) => {
  await page.goto('/');
  await page.getByText('A little more context', { exact: true }).click();
  await page.getByRole('checkbox', { name: /Pregnant or planning pregnancy/ }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Add a photo' })).toBeFocused();
});

for (const width of [390, 768, 1920]) {
  test(`${width}px layout keeps complete forms and long results inside the viewport without browser errors`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 900 });
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('checkbox', { name: /My skin can be sensitive/ }).check();
    const result = await label(page, 'Aqua, Glycerin, Parfum, Alcohol Denat., Retinol, Glycolic Acid, Cetearyl Alcohol, Ceramide NP, Tea Tree Oil', 'A long but readable QA product name for a complete responsive comparison');
    await result.getByText('What this comparison can and can’t tell you', { exact: false }).click();
    await expect(result.getByRole('heading', { name: 'Fragrance and your sensitive-skin profile' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(pageErrors).toEqual([]);
  });
}

test('reduced-motion preference applies to example and comparison scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView;
    (window as unknown as { qaScrollOptions: unknown[] }).qaScrollOptions = [];
    Element.prototype.scrollIntoView = function (options) {
      (window as unknown as { qaScrollOptions: unknown[] }).qaScrollOptions.push(options);
      return original.call(this, options);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { qaScrollOptions: unknown[] }).qaScrollOptions.length)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { qaScrollOptions: unknown[] }).qaScrollOptions.length)).toBeGreaterThanOrEqual(2);
  const options = await page.evaluate(() => (window as unknown as { qaScrollOptions: { behavior?: string }[] }).qaScrollOptions);
  expect(options.every(option => option?.behavior !== 'smooth')).toBe(true);
});

test('accepted long unbroken product and ingredient names wrap in manual and catalog mobile comparisons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const longIngredient = 'QAIngredient'.repeat(12);
  await page.getByLabel('Known ingredient allergies').fill(longIngredient);
  await label(page, `Aqua, Glycerin, ${longIngredient}`, 'A'.repeat(200));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.route('**/api/products?*', route => route.fulfill({ json: {
    products: [{ ...fixtures[0], name: 'B'.repeat(200), ingredients: `Aqua, Glycerin, ${longIngredient}` }],
    notice: 'QA fixture exercising accepted text lengths, not real catalog data.',
  } }));
  await page.getByRole('tab', { name: 'Find a product' }).click();
  await page.getByLabel('Product name, barcode, or link').fill('long text fixture');
  await page.getByRole('button', { name: 'Search products' }).click();
  await page.locator('.product-option').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  await expect(page.getByRole('region', { name: 'B'.repeat(200), exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
