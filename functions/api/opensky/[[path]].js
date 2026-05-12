/**
 * Cloudflare Pages Function — CORS proxy for OpenSky Network REST API.
 * Forwards GET /api/opensky/* to opensky-network.org/api/*
 * and adds CORS headers. The Bearer token comes from the client.
 */

const OPENSKY_BASE = 'https://opensky-network.org/api';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (context.request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const url = new URL(context.request.url);
  const upstreamPath = context.params.path.join('/');
  const upstream = `${OPENSKY_BASE}/${upstreamPath}${url.search}`;

  const headers = { 'Accept': 'application/json' };
  const auth = context.request.headers.get('Authorization');
  if (auth) headers['Authorization'] = auth;

  const resp = await fetch(upstream, { headers });

  const body = await resp.text();
  return new Response(body, {
    status: resp.status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': resp.headers.get('Content-Type') || 'application/json',
    },
  });
}
