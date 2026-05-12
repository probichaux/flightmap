/**
 * Cloudflare Pages Function — exchanges OpenSky OAuth2 client credentials for an access token.
 * POST /api/opensky/token  { client_id, client_secret }
 */

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { client_id, client_secret } = body;
  if (!client_id || !client_secret) {
    return new Response(JSON.stringify({ error: 'client_id and client_secret required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Exchange for access token
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id,
    client_secret,
  });

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': resp.headers.get('Content-Type') || 'application/json',
    },
  });
}
