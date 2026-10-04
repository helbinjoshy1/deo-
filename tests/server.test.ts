import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { after, test } from 'node:test';
import {
  CatalogUnavailableError,
  ProductInputError,
  createProductHandler,
  lookupProducts,
  normalizeProduct,
  parseProductQuery,
  type FetchLike,
  type ProductHandlerOptions,
} from '../server.ts';

const servers = new Set<Server>();
after(async () => {
  await Promise.all([...servers].map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});

async function startApi(options: ProductHandlerOptions = {}) {
  const handler = createProductHandler(options);
  const server = createServer((request, response) => {
    void handler(request, response).then((handled) => {
      if (!handled) { response.writeHead(404); response.end(); }
    });
  });
  servers.add(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

const sampleProduct = {
  code: '3337875597197',
  product_name: 'Example moisturising cream',
  brands: 'Example Brand',
  ingredients_text: 'Aqua, Glycerin, Ceramide NP',
  url: 'https://untrusted.example/product',
  image_url: 'https://untrusted.example/image.jpg',
  last_modified_t: 1_700_000_000,
};

test('query parsing handles names, barcodes and text-only URL extraction', () => {
  assert.deepEqual(parseProductQuery('  Daily   moisturiser  '), { kind: 'name', value: 'Daily moisturiser', fromUrl: false });
  assert.deepEqual(parseProductQuery('3337875597197'), { kind: 'barcode', value: '3337875597197', fromUrl: false });
  assert.deepEqual(parseProductQuery('https://world.openbeautyfacts.org/product/3337875597197/cream'), {
    kind: 'barcode', value: '3337875597197', fromUrl: true,
  });
  assert.deepEqual(parseProductQuery('https://shop.example.com/products/gentle-daily-cleanser?tracking=private'), {
    kind: 'name', value: 'gentle daily cleanser', fromUrl: true,
  });
  assert.deepEqual(parseProductQuery('https://shop.example.com/products/moisturizer'), {
    kind: 'name', value: 'moisturizer', fromUrl: true,
  });
  assert.deepEqual(parseProductQuery('https://www.amazon.com/Brand-Daily-Cream/dp/B000000123'), {
    kind: 'name', value: 'Brand Daily Cream', fromUrl: true,
  });
});

test('query parsing rejects local and private URLs, credentials and unusable input', () => {
  const invalid = [null, '', 'a', '123', 'x'.repeat(501), 'x\0y', 'ftp://shop.example.com/product/cream',
    'javascript:alert(1)', 'https://localhost/product/cream', 'https://127.0.0.1/product/cream',
    'https://10.1.2.3/product/cream', 'https://172.16.0.1/product/cream', 'https://192.168.1.1/product/cream',
    'https://169.254.169.254/product/cream', 'https://[::1]/product/cream', 'https://[fc00::1]/product/cream',
    'https://user:password@shop.example.com/product/cream', 'https://shop.example.com/',
    'https://shop.example.com/products/%ZZ'];
  for (const query of invalid) assert.throws(() => parseProductQuery(query), ProductInputError, String(query));
});

test('normalization preserves missing ingredients and creates only catalog source links', () => {
  assert.deepEqual(normalizeProduct(sampleProduct), {
    id: '3337875597197', name: 'Example moisturising cream', brand: 'Example Brand',
    ingredients: 'Aqua, Glycerin, Ceramide NP',
    sourceUrl: 'https://world.openbeautyfacts.org/product/3337875597197',
    updatedAt: '2023-11-14T22:13:20.000Z',
  });
  assert.equal(normalizeProduct({ code: '12345678', product_name: 'Unlisted ingredients' })?.ingredients, '');
  assert.equal(normalizeProduct({ code: '../../private', product_name: 'Invalid product' }), null);
  assert.equal(normalizeProduct({ code: '12345678' }), null);
  assert.equal(normalizeProduct(null), null);
});

test('lookup searches the fixed catalog origin and never forwards the supplied URL', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ products: [sampleProduct, sampleProduct, { code: '12345678' }] });
  };
  const products = await lookupProducts(parseProductQuery('https://shop.example.com/products/gentle-cleanser?customer_id=secret'), fetchImpl);
  assert.equal(products.length, 1);
  const requested = new URL(calls[0]!.url);
  assert.equal(requested.origin, 'https://world.openbeautyfacts.org');
  assert.equal(requested.pathname, '/cgi/search.pl');
  assert.equal(requested.searchParams.get('search_terms'), 'gentle cleanser');
  assert.equal(requested.searchParams.get('json'), '1');
  assert.equal(requested.searchParams.get('page_size'), '6');
  assert.equal(calls[0]!.url.includes('customer_id'), false);
  assert.equal(calls[0]!.init?.redirect, 'error');
  assert.ok(calls[0]!.init?.signal instanceof AbortSignal);
});

test('barcode lookup distinguishes a missing product from an unavailable catalog', async () => {
  const query = parseProductQuery('3337875597197');
  const result = await lookupProducts(query, async (url) => {
    assert.equal(new URL(url).pathname, '/api/v2/product/3337875597197.json');
    return Response.json({ status: 1, product: sampleProduct });
  });
  assert.equal(result[0]?.id, '3337875597197');
  assert.deepEqual(await lookupProducts(query, async () => Response.json({ status: 0 })), []);
  assert.deepEqual(await lookupProducts(query, async () => new Response(null, { status: 404 })), []);
  await assert.rejects(lookupProducts(query, async () => new Response(null, { status: 503 })), CatalogUnavailableError);
  await assert.rejects(lookupProducts(query, async () => { throw new Error('network blocked'); }), CatalogUnavailableError);
});

test('lookup rejects invalid and oversized catalog responses, including unadvertised streamed size', async () => {
  const query = parseProductQuery('daily cream');
  await assert.rejects(lookupProducts(query, async () => new Response('not json')), CatalogUnavailableError);
  await assert.rejects(lookupProducts(query, async () => Response.json({ unexpected: [] })), CatalogUnavailableError);
  await assert.rejects(lookupProducts(query, async () => new Response('{}', {
    headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
  })), CatalogUnavailableError);
  let cancelled = false;
  const oversizedBody = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(lookupProducts(query, async () => new Response(oversizedBody)), CatalogUnavailableError);
  assert.equal(cancelled, true);
});

test('HTTP health is available without catalog access and no photo upload API exists', async () => {
  const origin = await startApi({ fetchImpl: async () => { throw new Error('should not fetch'); } });
  const health = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', productSource: 'Open Beauty Facts', photoUploads: false });
  const unknown = await fetch(`${origin}/api/photos`);
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type') ?? '', /application\/json/);
  assert.equal((await fetch(`${origin}/api`)).status, 404);
  const post = await fetch(`${origin}/api/products`, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET');
});

test('HTTP lookup returns provenance, validates q, and caches identical searches', async () => {
  let requests = 0;
  let time = 10_000;
  const origin = await startApi({
    now: () => time,
    cacheTtlMs: 1_000,
    fetchImpl: async () => { requests += 1; return Response.json({ products: [sampleProduct] }); },
  });
  for (const query of ['daily cream', 'Daily Cream']) {
    const response = await fetch(`${origin}/api/products?q=${encodeURIComponent(query)}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, 'Open Beauty Facts');
    assert.equal(body.products[0].id, '3337875597197');
    assert.match(body.notice, /incomplete or outdated/);
  }
  assert.equal(requests, 1);
  time += 1_001;
  assert.equal((await fetch(`${origin}/api/products?q=daily%20cream`)).status, 200);
  assert.equal(requests, 2);
  for (const params of ['', '?q=', '?q=a', '?q=one&q=two', '?q=http%3A%2F%2Flocalhost%2Fcream']) {
    assert.equal((await fetch(`${origin}/api/products${params}`)).status, 400);
  }
  assert.equal(requests, 2);
});

test('HTTP responses expose unavailable lookup honestly and leave no fabricated results', async () => {
  const blocked = await startApi({ fetchImpl: async () => { throw new Error('connection blocked'); } });
  const failed = await fetch(`${blocked}/api/products?q=daily%20cream`);
  assert.equal(failed.status, 503);
  const failureBody = await failed.json();
  assert.match(failureBody.error, /paste the ingredient list/i);
  assert.equal(failureBody.products, undefined);

  const empty = await startApi({ fetchImpl: async () => Response.json({ products: [] }) });
  const noMatches = await fetch(`${empty}/api/products?q=daily%20cream`);
  assert.equal(noMatches.status, 200);
  const body = await noMatches.json();
  assert.deepEqual(body.products, []);
  assert.match(body.notice, /No matching products/);
});

test('HTTP rate limits product queries without restricting the health endpoint', async () => {
  let time = 1_000;
  const origin = await startApi({
    now: () => time,
    rateLimit: { maxRequests: 1, windowMs: 1_000 },
    fetchImpl: async () => Response.json({ products: [] }),
  });
  assert.equal((await fetch(`${origin}/api/products?q=daily%20cream`)).status, 200);
  const limited = await fetch(`${origin}/api/products?q=daily%20cream`);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '1');
  assert.equal((await fetch(`${origin}/api/health`)).status, 200);
  time += 1_000;
  assert.equal((await fetch(`${origin}/api/products?q=daily%20cream`)).status, 200);
});
