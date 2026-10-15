type Env = { ORIGIN_API: string; EDGE_HMAC_SECRET?: string };
const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,authorization,x-hendy-timestamp,x-hendy-signature', 'access-control-max-age': '86400' };
async function verifyInternal(request: Request, env: Env): Promise<boolean> {
  if (!env.EDGE_HMAC_SECRET || request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return true;
  const timestamp = request.headers.get('x-hendy-timestamp'); const signature = request.headers.get('x-hendy-signature');
  if (!timestamp || !signature || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) return false;
  const body = await request.clone().arrayBuffer(); const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.EDGE_HMAC_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prefix = new TextEncoder().encode(`${timestamp}.`); const message = new Uint8Array(prefix.byteLength + body.byteLength); message.set(prefix, 0); message.set(new Uint8Array(body), prefix.byteLength);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, message.buffer));
  const actual = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  if (actual.length !== signature.length) return false;
  let diff = 0; for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
export default { async fetch(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (!env.ORIGIN_API || env.ORIGIN_API.includes('replace-with-your-api')) return new Response(JSON.stringify({ error: 'ORIGIN_API is not configured' }), { status: 503, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (!(await verifyInternal(request, env))) return new Response(JSON.stringify({ error: 'Invalid edge signature' }), { status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  const incoming = new URL(request.url); const origin = new URL(env.ORIGIN_API); origin.pathname = `${origin.pathname.replace(/\/$/, '')}${incoming.pathname}`; origin.search = incoming.search;
  const headers = new Headers(request.headers); headers.delete('host');
  const upstream = await fetch(new Request(origin, { method: request.method, headers, body: ['GET','HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' }));
  const responseHeaders = new Headers(upstream.headers); for (const [k,v] of Object.entries(corsHeaders)) responseHeaders.set(k,v); responseHeaders.set('x-content-type-options','nosniff');
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
} } satisfies ExportedHandler<Env>;
