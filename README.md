# Skinwise

A skincare website for comparing a product’s ingredient label with a self-reported skin profile. Built with React, TypeScript, Vite, and a Node HTTP server.

## Develop

Use Node **24.19.0** (`.nvmrc`; Node 24.5 or later within the 24.x line supports the proxy-aware startup).

```sh
cd /workspace/deo-
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
npm run dev
```

The application and API share port **5173**, listening on `0.0.0.0`. Set `PORT` in the process environment to use another port. Startup enables Node’s supported environment-proxy handling for HTTPS catalog requests. No API key, database, authentication, or secret is required for the current workflow.

```sh
npm run build
npm test
npm run test:e2e
```

Browser checks use installed Chromium at `/usr/bin/chromium`. If that is unavailable on another machine, set `CHROMIUM_PATH` to its executable before running browser tests. No browser download is needed in this cloud environment.

For the built application, run `npm start` after `npm run build`. `GET /api/health` confirms API readiness. A health response alone does not verify upstream product access.

## Product workflow

- Choose a skin type, sensitivities, known ingredient allergies, and optional concerns. Men, women, and everyone spaces use the same ingredient rules. Shaving irritation and pregnancy are separate, optional observations.
- Search for a product name, barcode, or product URL. URLs are parsed as search text; arbitrary retailer pages are never fetched. Select a catalog entry and confirm its label against the current package.
- Alternatively paste a full comma-, semicolon-, or newline-separated INCI ingredient list. This workflow works without external network access.
- Review exact ingredient-name and known-alias matches, with a count showing how many names the checklist recognized. Translated or poorly covered labels receive a limited-coverage result. The checklist distinguishes drying ethanol from fatty alcohols and explains pregnancy, sensitivity, fragrance, and allergy considerations.
- Optionally add a face photo as a local visual reference. Photos are object URLs in browser memory and are never sent to the server, persisted, or used to diagnose skin. Removing a photo or leaving the page releases it.

“Try an example” uses a clearly marked **illustrative formula**, not a real catalog product. Browser tests use labeled fixtures to test catalog behavior; they do not establish live availability.

## Data and evidence

The server requests only `https://world.openbeautyfacts.org`, with timeouts, response-size bounds, a five-minute cache, and rate limits. The community catalog can be incomplete, outdated, or unavailable. Missing labels and failed lookup produce explicit states and a path to manual ingredient entry. No replacement product data is invented.

Official [Product Opener API documentation](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/index.md) was retrieved during setup. It explains community-data limitations, attribution, licensing, and request limits. [The API cheatsheet](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/ref-cheatsheet.md) documents the legacy keyword search used here. Barcode lookup uses the supported v2 endpoint. Live keyword search and barcode responses were verified in this instance. Product label results link back to Open Beauty Facts; its database is distributed under the Open Database License. Review the provider’s current terms before deploying or distributing a derived dataset.

Educational reference links:

- [AAD: Testing skincare products](https://www.aad.org/public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products)
- [AAD: Dry-skin care](https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin)
- [AAD: Skincare during pregnancy](https://www.aad.org/public/everyday-care/skin-care-secrets/routine/pregnancy-skin-care)
- [FDA: Cosmetics Labeling Guide](https://www.fda.gov/cosmetics/cosmetics-labeling-regulations/cosmetics-labeling-guide)
- [FDA: Alcohols in cosmetics](https://www.fda.gov/cosmetics/cosmetics-labeling-claims/alcohol-free): distinguishes fatty alcohols from ethanol.
- [FDA: Aromatherapy](https://www.fda.gov/cosmetics/cosmetic-products/aromatherapy): plant ingredients can cause irritation or allergy.
- [AAD: Choosing a moisturizer](https://www.aad.org/public/everyday-care/skin-care-basics/dry/pick-moisturizer): ceramides and hyaluronic acid.

AAD, FDA, and live catalog requests were initially denied by the cloud network proxy. The domains `world.openbeautyfacts.org`, `www.aad.org`, and `www.fda.gov` were saved in the environment configuration draft; subsequent requests succeeded. Live keyword search returned genuine product labels, and the reference pages above were retrieved successfully. Outdated AAD/FDA paths were corrected after actual 404 responses. Review and save the configuration in environment settings, then publish to retain it for future tasks. Draft persistence and current-instance success do not establish publication or fresh-task restoration.

## Scope and clinical limits

This is an educational prototype. It has no trained diagnostic model, clinician review, clinical accuracy benchmark, allergy test, or guaranteed product-safety score. Ingredient concentration, pH, formulation, label completeness, and individual responses cannot be established from an INCI list. Exact name matching cannot rule out cross-reactions or unlabeled components. Concern selection does not prove a product treats that concern.

A future photo-assessment feature requires consent, licensed representative data, clinician-defined targets, evaluation across skin tones and image conditions, and careful deployment review. Product formula coverage and label provenance should be validated before claiming clinical performance. None of those future capabilities are represented as implemented.

## Deploy and verify

[Render deployment instructions](deploy/README.md) and the root `render.yaml` describe hosting the complete Node website and API on the free plan. A verified public application URL must come from the created Render service; it is not the deployment launcher link.

The functional suite currently passes **38 unit/API tests and 32 browser workflows**, including every profile control, navigation, validation, keyboard tabs, reduced motion, catalog recovery, local photo previews, and long-input wrapping at mobile widths. Live name, barcode, and product-link lookups were separately verified against real community entries. This verifies software behavior, not clinical accuracy.

Reusable cloud setup and startup instructions use the existing isolated checkout and preserve source files and lockfiles. Do not create a Git worktree for ordinary cloud startup unless the task explicitly requests one.
