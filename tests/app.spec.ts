import { expect, test, type Page } from '@playwright/test';

async function enterLabel(page: Page, ingredients: string, name = 'My label comparison') {
  await page.getByRole('tab', { name: 'Paste ingredients' }).click();
  await page.getByLabel('Product name', { exact: false }).fill(name);
  await page.getByLabel('Full ingredient list').fill(ingredients);
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  const results = page.getByRole('region', { name, exact: true });
  await expect(results).toBeVisible();
  return results;
}

// Test-only snapshot observed from the live catalog on 2026-10-04. Requests are
// mocked for deterministic UI coverage; this is neither application fallback
// data nor a verified current product formula. The translated label is kept
// exactly as supplied rather than converted into fabricated English INCI data.
const catalogFixture = {
  id: '3337875598996',
  name: 'moisturising cream',
  brand: 'CeraVe',
  ingredients: 'Eau, glycérine, alcool cétéarylique, triglycéride caprylique/caprique, alcool cétylique, céteareth-20, vaseline, phosphate de potassium, céramide NP, céramide AP, céramide EOP, carbomère, diméthicone, méthosulfate de béhentrimonium, lauryllactylate de sodium, hyaluronate de sodium, cholestérol, phénoxyéthanol, edta disodique, phosphate dipotassique, tocophérol, phytosphingosine, gomme xanthane, éthylhexylglycérine. (Code F.I.L. D213768/2)',
  sourceUrl: 'https://world.openbeautyfacts.org/product/3337875598996',
  updatedAt: '2026-05-20T07:59:58.000Z',
};

test('manual labels surface sensitive-skin cautions and distinguish fatty alcohols', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('checkbox', { name: /My skin can be sensitive/ }).check();
  await page.getByRole('button', { name: 'Dry Often feels tight', exact: true }).click();
  const results = await enterLabel(page, 'Aqua, Glycerin, Cetyl Alcohol, Alcohol Denat., Parfum, Salicylic Acid');

  await expect(results.getByText('3 points to review', { exact: true })).toBeVisible();
  await expect(results.getByRole('heading', { name: 'Fragrance and your sensitive-skin profile' })).toBeVisible();
  await expect(results.getByRole('heading', { name: 'Exfoliating ingredients: introduce carefully' })).toBeVisible();
  const alcoholFlag = results.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Alcohol that may feel drying' }) });
  await expect(alcoholFlag.locator('.flag-ingredients')).toHaveText('Alcohol Denat.');
  await expect(results.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Moisturizing ingredients are listed' }) }).locator('.flag-ingredients')).toHaveText('Glycerin');
  const fattyAlcoholNote = results.getByRole('article').filter({ has: page.locator('.flag-ingredients').filter({ hasText: /^Cetyl Alcohol$/ }) });
  await expect(fattyAlcoholNote).toHaveClass(/\bflag-note\b/);
  await expect(fattyAlcoholNote.locator('.flag-title')).toContainText('Keep in mind');
  await expect(fattyAlcoholNote.getByRole('link', { name: 'FDA · Alcohols in cosmetics' })).toHaveAttribute('href', 'https://www.fda.gov/cosmetics/cosmetics-labeling-claims/alcohol-free');
  await expect(results.getByRole('link', { name: /^AAD · .*sensitive skin/i }).first()).toHaveAttribute('href', /^https:\/\/www\.aad\.org\//);
  await expect(results.getByText(/Educational guidance, not a diagnosis/)).toBeVisible();
});

test('allergy name aliases match label ingredients', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Known ingredient allergies').fill('fragrance, glycerol');
  const results = await enterLabel(page, 'Aqua, Glycerin, Parfum');
  const allergyFlag = results.getByRole('article').filter({ has: page.getByRole('heading', { name: 'A named allergy matches this label' }) });
  await expect(allergyFlag.locator('.flag-ingredients')).toHaveText('GlycerinParfum');
  await expect(allergyFlag).toContainText('This is a name match, not an allergy test.');
  await results.getByText('What this comparison can and can’t tell you').click();
  await expect(results.getByText(/Allergy matching uses exact names and known aliases only/)).toBeVisible();
});

test('the example is visibly illustrative and has no catalog attribution', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  await expect(page.getByText('Illustrative formula — this is not a verified real product.')).toBeVisible();
  const results = page.getByRole('region', { name: 'Daily Barrier Moisturizer', exact: true });
  await expect(results.getByText('Example formula', { exact: true })).toBeVisible();
  await expect(results.locator('.result-source')).toHaveCount(0);
  await expect(results.getByText(/No dermatologist has reviewed this comparison/)).toBeVisible();
});

test('men and women spaces retain the same ingredient flags for the same profile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('checkbox', { name: /My skin can be sensitive/ }).check();
  const results = await enterLabel(page, 'Aqua, Glycerin, Parfum, Retinol');
  const flags = await results.getByRole('article').allTextContents();
  for (const audience of ['Women', 'Men', 'Everyone']) {
    const button = page.getByRole('button', { name: audience, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(results.getByRole('article')).toHaveText(flags);
  }
});

test('a successful mocked catalog fixture retains source attribution and update date', async ({ page }) => {
  await page.route('**/api/products?*', async route => {
    expect(new URL(route.request().url()).searchParams.get('q')).toBe(catalogFixture.id);
    await route.fulfill({ json: { products: [catalogFixture], notice: 'Test-only fixture: catalog labels may be incomplete or outdated.' } });
  });
  await page.goto('/');
  await page.getByLabel('Product name, barcode, or link').fill(catalogFixture.id);
  await page.getByRole('button', { name: 'Search products' }).click();
  await page.getByRole('button', { name: /moisturising cream.*Ingredient label available/ }).click();
  await expect(page.getByRole('link', { name: 'View source' })).toHaveAttribute('href', catalogFixture.sourceUrl);
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  const results = page.getByRole('region', { name: catalogFixture.name, exact: true });
  await expect(results.getByRole('link', { name: 'Open Beauty Facts' })).toHaveAttribute('href', catalogFixture.sourceUrl);
  await expect(results.locator('.result-source')).toContainText('Entry updated 20/5/2026');
  await expect(results.getByText('Example formula', { exact: true })).toHaveCount(0);
  await expect(results.getByText(/\d+ ingredients listed/, { exact: true })).toBeVisible();
  await expect(results.getByText(/\d+ of \d+ names recognized/, { exact: true })).toBeVisible();
  await expect(results.getByText(/this checklist has incomplete coverage/)).toBeVisible();
});

test('a mocked catalog entry without ingredients requires the current label', async ({ page }) => {
  const missingLabelFixture = { ...catalogFixture, ingredients: '' };
  await page.route('**/api/products?*', route => route.fulfill({ json: { products: [missingLabelFixture] } }));
  await page.goto('/');
  await page.getByLabel('Product name, barcode, or link').fill('label missing fixture');
  await page.getByRole('button', { name: 'Search products' }).click();
  await page.getByRole('button', { name: /moisturising cream.*Ingredient label missing/ }).click();
  await expect(page.getByText('This entry has no ingredient label, so we can’t compare it yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare with my profile' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add the label yourself' }).click();
  await expect(page.getByLabel('Product name', { exact: false })).toHaveValue(catalogFixture.name);
  await page.getByLabel('Full ingredient list').fill('Aqua, Glycerin');
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  await expect(page.getByRole('region', { name: catalogFixture.name, exact: true })).toBeVisible();
});

test('a mocked 503 catalog failure keeps the manual comparison usable', async ({ page }) => {
  await page.route('**/api/products?*', route => route.fulfill({ status: 503, json: { error: 'Catalog test fixture is temporarily unavailable. Paste the label to continue.' } }));
  await page.goto('/');
  await page.getByLabel('Product name, barcode, or link').fill('temporarily unavailable fixture');
  await page.getByRole('button', { name: 'Search products' }).click();
  await expect(page.getByRole('alert')).toContainText('We couldn’t look up this product.');
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await page.getByRole('button', { name: 'Paste the label instead' }).click();
  await page.getByLabel('Full ingredient list').fill('Aqua, Glycerin, Parfum');
  await page.getByRole('button', { name: 'Compare with my profile' }).click();
  await expect(page.getByRole('region', { name: 'Your product', exact: true })).toBeVisible();
});

test('face photo previews and removal remain local to the browser', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const outgoingRequests: string[] = [];
  page.on('request', request => {
    if (/^https?:/.test(request.url())) outgoingRequests.push(`${request.method()} ${request.url()}`);
  });
  // A valid 1 × 1 PNG fixture exercises the preview without using a real face.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVx8AAAAASUVORK5CYII=', 'base64');
  await page.getByLabel('Choose a face photo').setInputFiles({ name: 'private-photo-fixture.png', mimeType: 'image/png', buffer: png });
  const preview = page.getByRole('img', { name: 'Your private skin reference' });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('src', /^blob:/);
  await expect(page.getByText(/1 × 1 pixels/)).toBeVisible();
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a photo' })).toBeVisible();
  expect(outgoingRequests).toEqual([]);
});

test('the 390-pixel mobile form is functional without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('checkbox', { name: /My skin can be sensitive/ }).check();
  const results = await enterLabel(page, 'Aqua, Glycerin, Parfum', 'Mobile label check');
  await expect(results.getByText('1 point to review', { exact: true })).toBeVisible();
  await expect(results.getByRole('heading', { name: 'Fragrance and your sensitive-skin profile' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(pageErrors).toEqual([]);
});
