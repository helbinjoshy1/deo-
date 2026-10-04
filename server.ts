import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CATALOG_ORIGIN = 'https://world.openbeautyfacts.org';
const PRODUCT_FIELDS = 'code,product_name,brands,ingredients_text,url,last_modified_t';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const CATALOG_NOTICE = 'Product information is contributed to Open Beauty Facts and may be incomplete or outdated. Check the ingredient list on your packaging.';
const CATALOG_UNAVAILABLE = 'The product catalog is temporarily unavailable or has reached its request limit. You can still paste the ingredient list from your packaging to continue.';

export interface Product {
  id: string;
  name: string;
  brand: string;
  ingredients: string;
  imageUrl?: string;
  sourceUrl: string;
  updatedAt?: string;
}

export interface ProductQuery {
  kind: 'name' | 'barcode';
  value: string;
  fromUrl: boolean;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class ProductInputError extends Error {}
export class CatalogUnavailableError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const [a, b, c] = host.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (ipVersion === 6) {
    // Only global unicast addresses are accepted; IPv4-mapped and local addresses are excluded.
    return /^[23][0-9a-f]{3}:/.test(host) && !/^2001:db8:/i.test(host);
  }
  if (!host.includes('.') || /(?:^|\.)(?:localhost|local|localdomain|internal|lan|home|onion|test|invalid|example)$/.test(host)) return false;
  return host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

/** Links are parsed as text only. The server never requests a user-provided address. */
export function parseProductQuery(input: string | null): ProductQuery {
  if (input === null || input.length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(input)) {
    throw new ProductInputError('Enter a product name, an 8–14 digit barcode, or a public product link (up to 500 characters).');
  }
  const query = input.normalize('NFKC').trim();
  if (!query) throw new ProductInputError('Enter a product name, barcode, or public product link.');
  if (/^\d+$/.test(query)) {
    if (!/^\d{8,14}$/.test(query)) throw new ProductInputError('A product barcode should contain 8–14 digits.');
    return { kind: 'barcode', value: query, fromUrl: false };
  }

  const looksLikeUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(query) || /^(?:https?|file|data|javascript):/i.test(query);
  let productName = query;
  if (looksLikeUrl) {
    let url: URL;
    try { url = new URL(query); } catch { throw new ProductInputError('Enter a complete public product link beginning with https:// or http://.'); }
    if (!['http:', 'https:'].includes(url.protocol) || !isPublicHost(url.hostname) || url.username || url.password) {
      throw new ProductInputError('Use a public http:// or https:// product link without login details. Local and private addresses are not supported.');
    }
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); } catch { throw new ProductInputError('This product link contains invalid characters. Enter the product name instead.'); }
    const isCatalogUrl = url.hostname === 'openbeautyfacts.org' || url.hostname.endsWith('.openbeautyfacts.org');
    const barcode = isCatalogUrl ? pathname.match(/\/(?:product|produit|producto|produkt|produto)\/(\d{8,14})(?:\/|$)/i)?.[1] : undefined;
    if (barcode) return { kind: 'barcode', value: barcode, fromUrl: true };

    const segments = pathname.split('/').filter(Boolean);
    const amazonProductIndex = segments.findIndex((segment) => segment === 'dp' || segment === 'gp');
    const usableSegments = amazonProductIndex >= 0 ? segments.slice(0, amazonProductIndex) : segments;
    const slug = [...usableSegments].reverse().find((segment) => /[a-z]/i.test(segment)
      && !/^(?:products?|items?|shop|store|index(?:\.html?)?)$/i.test(segment));
    productName = slug ?? url.searchParams.get('product_name') ?? url.searchParams.get('name') ?? '';
    productName = productName.replace(/\.(?:html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' ');
    if (!productName) throw new ProductInputError('A product name could not be read from this link. Enter the name or barcode from the packaging instead.');
  }
  productName = productName.replace(/\s+/g, ' ').trim();
  if (productName.length < 2 || productName.length > 120) {
    throw new ProductInputError('Enter a product name between 2 and 120 characters.');
  }
  return { kind: 'name', value: productName, fromUrl: looksLikeUrl };
}

export function normalizeProduct(value: unknown): Product | null {
  if (!isRecord(value)) return null;
  const id = typeof value.code === 'number' ? String(value.code) : cleanText(value.code, 24);
  const name = cleanText(value.product_name, 240);
  if (!/^\d{4,24}$/.test(id) || !name) return null;
  const product: Product = {
    id,
    name,
    brand: cleanText(value.brands, 240),
    ingredients: cleanText(value.ingredients_text, 20_000),
    sourceUrl: `${CATALOG_ORIGIN}/product/${id}`,
  };
  const timestamp = typeof value.last_modified_t === 'number' ? value.last_modified_t : Number.NaN;
  if (Number.isFinite(timestamp) && timestamp > 0 && timestamp < 8_640_000_000_000) {
    product.updatedAt = new Date(timestamp * 1000).toISOString();
  }
  return product;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredBytes = Number(response.headers.get('content-length'));
  if (declaredBytes > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new CatalogUnavailableError(CATALOG_UNAVAILABLE);
  }
  if (!response.body) throw new CatalogUnavailableError(CATALOG_UNAVAILABLE);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let json = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new CatalogUnavailableError(CATALOG_UNAVAILABLE);
      }
      json += decoder.decode(chunk.value, { stream: true });
    }
    json += decoder.decode();
    return JSON.parse(json);
  } finally {
    reader.releaseLock();
  }
}

/** Fetches only the fixed public catalog origin, regardless of query input. */
export async function lookupProducts(query: ProductQuery, fetchImpl: FetchLike = globalThis.fetch): Promise<Product[]> {
  const endpoint = query.kind === 'barcode'
    ? new URL(`/api/v2/product/${encodeURIComponent(query.value)}.json`, CATALOG_ORIGIN)
    : new URL('/cgi/search.pl', CATALOG_ORIGIN);
  endpoint.searchParams.set('fields', PRODUCT_FIELDS);
  if (query.kind === 'name') {
    endpoint.searchParams.set('search_terms', query.value);
    endpoint.searchParams.set('search_simple', '1');
    endpoint.searchParams.set('action', 'process');
    endpoint.searchParams.set('json', '1');
    endpoint.searchParams.set('page_size', '6');
  }
  try {
    const response = await fetchImpl(endpoint.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'SkincareGuide/0.1 (product ingredient lookup)' },
      signal: AbortSignal.timeout(9_000),
      redirect: 'error',
    });
    if (query.kind === 'barcode' && response.status === 404) {
      await response.body?.cancel();
      return [];
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new CatalogUnavailableError(CATALOG_UNAVAILABLE);
    }
    const data = await readBoundedJson(response);
    if (!isRecord(data)) throw new CatalogUnavailableError(CATALOG_UNAVAILABLE);
    let rows: unknown[];
    if (query.kind === 'barcode') {
      if (data.status === 0) return [];
      if (data.status !== 1 || !isRecord(data.product)) throw new CatalogUnavailableError(CATALOG_UNAVAILABLE);
      rows = [{ ...data.product, code: data.product.code ?? query.value }];
    } else {
      if (!Array.isArray(data.products)) throw new CatalogUnavailableError(CATALOG_UNAVAILABLE);
      rows = data.products.slice(0, 6);
    }
    const products = rows.map(normalizeProduct).filter((product): product is Product => product !== null);
    return products.filter((product, index) => products.findIndex((other) => other.id === product.id) === index);
  } catch {
    throw new CatalogUnavailableError(CATALOG_UNAVAILABLE);
  }
}

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

interface RateBucket { since: number; count: number }
export interface ProductHandlerOptions {
  fetchImpl?: FetchLike;
  now?: () => number;
  cacheTtlMs?: number;
  rateLimit?: { maxRequests: number; windowMs: number };
}

/** Returns false for non-API paths so a development or static handler can serve the app. */
export function createProductHandler(options: ProductHandlerOptions = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60_000;
  const rateLimit = options.rateLimit ?? { maxRequests: 8, windowMs: 60_000 };
  const cache = new Map<string, { expires: number; products: Product[] }>();
  const inFlight = new Map<string, Promise<Product[]>>();
  const clients = new Map<string, RateBucket>();
  let upstream: RateBucket = { since: now(), count: 0 };

  return async function handleProductRequest(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    let url: URL;
    try { url = new URL(request.url ?? '/', 'http://localhost'); } catch {
      sendJson(response, 400, { error: 'Invalid request URL.' });
      return true;
    }
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return false;
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      request.resume();
      sendJson(response, 405, { error: 'Use GET for this endpoint.' });
      return true;
    }
    if (url.pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok', productSource: 'Open Beauty Facts', photoUploads: false });
      return true;
    }
    if (url.pathname !== '/api/products') {
      sendJson(response, 404, { error: 'API endpoint not found.' });
      return true;
    }
    try {
      if (url.searchParams.getAll('q').length !== 1) throw new ProductInputError('Provide one product name, barcode, or link.');
      const query = parseProductQuery(url.searchParams.get('q'));
      const time = now();
      const client = request.socket.remoteAddress ?? 'unknown';
      // Addresses are kept only in this short-lived memory bucket and are never logged.
      for (const [address, bucket] of clients) {
        if (time - bucket.since >= rateLimit.windowMs) clients.delete(address);
      }
      let bucket = clients.get(client);
      if (!bucket) {
        if (clients.size >= 1_000) clients.delete(clients.keys().next().value!);
        bucket = { since: time, count: 0 };
        clients.set(client, bucket);
      }
      if (bucket.count >= rateLimit.maxRequests) {
        response.setHeader('Retry-After', Math.max(1, Math.ceil((rateLimit.windowMs - (time - bucket.since)) / 1000)));
        sendJson(response, 429, { error: 'Please wait a moment before searching again. You can paste the ingredient list while you wait.' });
        return true;
      }
      bucket.count += 1;
      const key = `${query.kind}:${query.value.toLowerCase()}`;
      const cached = cache.get(key);
      let products: Product[];
      if (cached && cached.expires > time) {
        products = cached.products;
      } else {
        cache.delete(key);
        let pending = inFlight.get(key);
        if (!pending) {
          if (time - upstream.since >= 60_000) upstream = { since: time, count: 0 };
          if (upstream.count >= 10) throw new CatalogUnavailableError(CATALOG_UNAVAILABLE);
          upstream.count += 1;
          pending = lookupProducts(query, fetchImpl);
          inFlight.set(key, pending);
        }
        try {
          products = await pending;
          if (cache.size >= 100) cache.delete(cache.keys().next().value!);
          cache.set(key, { expires: now() + cacheTtlMs, products });
        } finally {
          if (inFlight.get(key) === pending) inFlight.delete(key);
        }
      }
      const notices = [products.length ? CATALOG_NOTICE : 'No matching products were found. Paste the ingredient list from your packaging to continue.'];
      if (query.fromUrl) notices.push('Your link was used only to extract a name or barcode; the linked page was not fetched. Check that the selected product matches your packaging.');
      sendJson(response, 200, { products, source: 'Open Beauty Facts', notice: notices.join(' ') });
    } catch (error) {
      sendJson(response, error instanceof ProductInputError ? 400 : 503, {
        error: error instanceof ProductInputError ? error.message : CATALOG_UNAVAILABLE,
      });
    }
    return true;
  };
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

async function serveProductionFile(request: IncomingMessage, response: ServerResponse, distDirectory: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendJson(response, 405, { error: 'Use GET or HEAD for app pages.' });
    return;
  }
  let pathname: string;
  try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname); } catch {
    sendJson(response, 400, { error: 'Invalid page path.' });
    return;
  }
  const target = resolve(distDirectory, `.${pathname}`);
  if (!target.startsWith(`${distDirectory}${sep}`) && target !== distDirectory || pathname.includes('\0') || pathname.split('/').some((segment) => segment.startsWith('.'))) {
    sendJson(response, 400, { error: 'Invalid page path.' });
    return;
  }
  let file = target;
  try {
    const info = await stat(file);
    if (!info.isFile()) file = resolve(distDirectory, 'index.html');
  } catch {
    if (extname(pathname)) {
      sendJson(response, 404, { error: 'File not found.' });
      return;
    }
    file = resolve(distDirectory, 'index.html');
  }
  try {
    const actualFile = await realpath(file);
    if (!actualFile.startsWith(`${distDirectory}${sep}`)) {
      sendJson(response, 404, { error: 'File not found.' });
      return;
    }
    const info = await stat(actualFile);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(actualFile)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(actualFile).on('error', () => response.destroy()).pipe(response);
  } catch {
    sendJson(response, 503, { error: 'The application build is unavailable. Run npm run build first.' });
  }
}

export async function startServer() {
  const rootDirectory = dirname(fileURLToPath(import.meta.url));
  const production = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT ?? 5173);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('PORT must be a valid TCP port.');
  const distDirectory = resolve(rootDirectory, 'dist');
  const vite = production ? undefined : await (await import('vite')).createServer({
    root: rootDirectory,
    server: { middlewareMode: true },
    appType: 'spa',
  });
  const api = createProductHandler();
  const server = createServer((request, response) => {
    void (async () => {
      if (await api(request, response)) return;
      if (vite) vite.middlewares(request, response);
      else await serveProductionFile(request, response, distDirectory);
    })().catch(() => {
      if (!response.headersSent) sendJson(response, 500, { error: 'Unable to complete the request.' });
      else response.destroy();
    });
  });
  server.once('close', () => { void vite?.close(); });
  server.listen(port, '0.0.0.0', () => {
    const address = server.address();
    console.log(`Skincare app ready on http://0.0.0.0:${typeof address === 'object' && address ? address.port : port}`);
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'The application server could not start.');
    process.exitCode = 1;
  });
}
