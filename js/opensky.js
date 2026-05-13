/**
 * OpenSky Network client — fetches historical flights by N-number.
 * Converts N-number → ICAO24 hex, then queries OpenSky in 2-day chunks.
 * Uses OAuth2 client credentials (free OpenSky account required).
 */
const OpenSky = (() => {
  const BASE_URL = '/api/opensky';
  const STORAGE_KEY_ID = 'flightmap_opensky_client_id';
  const STORAGE_KEY_SECRET = 'flightmap_opensky_client_secret';
  const LOOKBACK_DAYS = 120;
  const CHUNK_DAYS = 2;
  const CONCURRENCY = 5;

  // ── Credentials ──────────────────────────────────────
  // Credentials are stored in sessionStorage (not localStorage) so they are
  // not persisted across browser sessions, limiting exposure if an XSS payload
  // ever runs on this page.

  function getCredentials() {
    return {
      clientId: sessionStorage.getItem(STORAGE_KEY_ID) || '',
      clientSecret: sessionStorage.getItem(STORAGE_KEY_SECRET) || '',
    };
  }

  function setCredentials(clientId, clientSecret) {
    if (clientId) sessionStorage.setItem(STORAGE_KEY_ID, clientId.trim());
    else sessionStorage.removeItem(STORAGE_KEY_ID);
    if (clientSecret) sessionStorage.setItem(STORAGE_KEY_SECRET, clientSecret.trim());
    else sessionStorage.removeItem(STORAGE_KEY_SECRET);
  }

  // ── OAuth2 token ─────────────────────────────────────

  let cachedToken = null;
  let tokenExpiry = 0;

  async function getToken() {
    if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

    const { clientId, clientSecret } = getCredentials();
    if (!clientId || !clientSecret) {
      throw new Error('OpenSky credentials not set — add them in OpenSky Settings below.');
    }

    const resp = await fetch(BASE_URL + '/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    });

    if (!resp.ok) {
      if (resp.status === 401) throw new Error('Invalid OpenSky credentials.');
      throw new Error('Token exchange failed (HTTP ' + resp.status + ').');
    }

    const data = await resp.json();
    cachedToken = data.access_token;
    // Refresh 2 min before expiry
    tokenExpiry = Date.now() + (data.expires_in - 120) * 1000;
    return cachedToken;
  }

  // ── N-number → ICAO24 hex ───────────────────────────

  const SUFFIX_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 letters (no I, O)

  // Block sizes: how many valid N-numbers exist in a sub-tree
  // at each digit depth (1 = first digit placed, up to 5).
  // blockSize[d] = 1 (stop) + letterSuffix(5-d) + (d<5 ? 10*blockSize[d+1] : 0)
  //   letterSuffix(r): 0 if r=0, 24 if r=1, 600 if r>=2
  const BLOCK = [0, 101711, 10111, 951, 35, 1];

  function letterSuffixCount(remaining) {
    if (remaining <= 0) return 0;
    if (remaining === 1) return 24;
    return 600; // 24 + 24*24
  }

  /**
   * Convert a US N-number (e.g. "N12345" or "N905NA") to an ICAO24 hex string.
   * Returns null if the N-number is invalid.
   */
  function nNumberToIcao24(nNumber) {
    const s = nNumber.toUpperCase().replace(/^N/, '');
    if (!s || s.length > 5) return null;

    // Split into digit part and letter suffix
    let digitPart = '';
    let letterPart = '';
    for (const c of s) {
      if (c >= '0' && c <= '9' && letterPart === '') {
        digitPart += c;
      } else if (SUFFIX_CHARS.includes(c)) {
        letterPart += c;
      } else {
        return null;
      }
    }

    if (digitPart.length === 0 || digitPart[0] === '0') return null;
    if (letterPart.length > 2) return null;
    if (digitPart.length + letterPart.length > 5) return null;

    let offset = 0;

    // First digit (1-9)
    offset += (parseInt(digitPart[0]) - 1) * BLOCK[1];

    // Subsequent digits navigate deeper into the tree
    for (let i = 1; i < digitPart.length; i++) {
      const d = parseInt(digitPart[i]);
      const remaining = 5 - i; // chars remaining at this decision point
      offset += 1 + letterSuffixCount(remaining); // skip "stop" + letter suffixes
      offset += d * BLOCK[i + 1]; // skip sub-blocks for digits 0..(d-1)
    }

    // Letter suffix
    if (letterPart.length > 0) {
      const remaining = 5 - digitPart.length;
      offset += 1; // skip "stop"
      const li0 = SUFFIX_CHARS.indexOf(letterPart[0]);
      if (remaining >= 2) {
        offset += li0 * 25; // each letter group: 1 single + 24 double
      } else {
        offset += li0;
      }
      if (letterPart.length > 1) {
        offset += 1; // skip the "single letter only" entry
        offset += SUFFIX_CHARS.indexOf(letterPart[1]);
      }
    }

    return (0xA00001 + offset).toString(16).padStart(6, '0');
  }

  // ── Flight fetching ──────────────────────────────────

  /**
   * Fetch historical flights for a registration number over the last 120 days.
   * Queries OpenSky in 2-day chunks with limited concurrency.
   * @param {string} registration - e.g. "N12345"
   * @param {function} [onProgress] - called with (completed, total) after each chunk
   * @returns {Promise<Array>} Array of OpenSky flight objects
   */
  async function fetchFlights(registration, onProgress) {
    const hex = nNumberToIcao24(registration);
    if (!hex) throw new Error('Invalid N-number: ' + registration);

    const token = await getToken();

    // Build 2-day chunks over the lookback period
    const now = Math.floor(Date.now() / 1000);
    const start = now - LOOKBACK_DAYS * 86400;
    const chunks = [];
    for (let t = start; t < now; t += CHUNK_DAYS * 86400) {
      chunks.push({ begin: t, end: Math.min(t + CHUNK_DAYS * 86400, now) });
    }

    const allFlights = [];
    let completed = 0;

    // Process chunks with bounded concurrency
    async function processChunk(chunk) {
      const url = `${BASE_URL}/flights/aircraft?icao24=${hex}&begin=${chunk.begin}&end=${chunk.end}`;
      const resp = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + token },
      });

      if (resp.status === 404 || resp.status === 204) return; // no flights this period
      if (resp.status === 429) throw new Error('Rate limited — try again in a minute.');
      if (!resp.ok) throw new Error('OpenSky error ' + resp.status);

      const data = await resp.json();
      if (Array.isArray(data)) {
        for (const f of data) allFlights.push(f);
      }
      completed++;
      if (onProgress) onProgress(completed, chunks.length);
    }

    // Run with concurrency limit
    const queue = [...chunks];
    async function worker() {
      while (queue.length > 0) {
        const chunk = queue.shift();
        await processChunk(chunk);
      }
    }
    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);

    return allFlights;
  }

  /**
   * Convert OpenSky flight objects into "ORIG-DEST" text lines.
   * Skips flights with unknown departure or arrival airports.
   */
  function toFlightLines(flights) {
    const lines = [];
    for (const f of flights) {
      const orig = f.estDepartureAirport;
      const dest = f.estArrivalAirport;
      if (orig && dest) lines.push(orig + '-' + dest);
    }
    return lines;
  }

  return { getCredentials, setCredentials, fetchFlights, toFlightLines, nNumberToIcao24 };
})();
