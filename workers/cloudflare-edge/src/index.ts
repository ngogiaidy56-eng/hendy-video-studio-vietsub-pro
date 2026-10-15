type Env = {
  ORIGIN_API: string;
  ALLOWED_ORIGINS?: string;
  EDGE_HMAC_SECRET?: string;
};

const CORS_BASE: Record<string, string> = {
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-hendy-timestamp,x-hendy-signature',
  'access-control-max-age': '86400',
};

function allowedOrigins(env: Env): Set<string> {
  return new Set((env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
}

function isOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('origin');
  // Requests without an Origin header are non-browser clients; API auth still belongs to the origin API.
  return !origin || allowedOrigins(env).has(origin);
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers(CORS_BASE);
  const origin = request.headers.get('origin');
  if (origin && allowedOrigins(env).has(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return headers;
}

async function verifyInternal(request: Request, env: Env): Promise<boolean> {
  // Keep this optional: browser clients authenticate to the API with their user bearer token.
  // Do not configure EDGE_HMAC_SECRET unless every mutating caller signs requests server-side.
  if (!env.EDGE_HMAC_SECRET || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  const timestamp = request.headers.get('x-hendy-timestamp');
  const signature = request.headers.get('x-hendy-signature');
  if (!timestamp || !signature || !Number.isFinite(Number(timestamp)) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) return false;
  const body = await request.clone().arrayBuffer();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.EDGE_HMAC_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const message = new Uint8Array(prefix.byteLength + body.byteLength);
  message.set(prefix, 0);
  message.set(new Uint8Array(body), prefix.byteLength);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, message.buffer));
  const actual = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual.length !== signature.length) return false;
  let diff = 0;
  for (let index = 0; index < actual.length; index++) diff |= actual.charCodeAt(index) ^ signature.charCodeAt(index);
  return diff === 0;
}

function jsonError(status: number, error: string, headers: Headers): Response {
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify({ error }), { status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env);
    if (!isOriginAllowed(request, env)) return jsonError(403, 'Origin is not allowed by Cloudflare Edge', headers);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!env.ORIGIN_API) return jsonError(503, 'ORIGIN_API is not configured', headers);

    let origin: URL;
    try {
      origin = new URL(env.ORIGIN_API);
      if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash) {
        return jsonError(503, 'ORIGIN_API must be an HTTPS origin without credentials, query, or fragment', headers);
      }
    } catch {
      return jsonError(503, 'ORIGIN_API is not a valid URL', headers);
    }

    if (!(await verifyInternal(request, env))) return jsonError(401, 'Invalid edge signature', headers);
    const incoming = new URL(request.url);
    origin.pathname = `${origin.pathname.replace(/\/$/, '')}${incoming.pathname}`;
    origin.search = incoming.search;
    const upstreamHeaders = new Headers(request.headers);
    upstreamHeaders.delete('host');
    upstreamHeaders.delete('cf-connecting-ip');
    upstreamHeaders.delete('x-forwarded-for');
    let upstream: Response;
    try {
      upstream = await fetch(new Request(origin, {
        method: request.method,
        headers: upstreamHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      }));
    } catch {
      return jsonError(502, 'Origin API is temporarily unavailable', headers);
    }
    const responseHeaders = new Headers(upstream.headers);
    for (const [key, value] of headers.entries()) responseHeaders.set(key, value);
    responseHeaders.set('x-content-type-options', 'nosniff');
    responseHeaders.set('cache-control', responseHeaders.get('cache-control') ?? 'no-store');
    responseHeaders.delete('server');
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  },
} satisfies ExportedHandler<Env>;
