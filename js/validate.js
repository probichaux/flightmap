/**
 * Airport lookup and flight-input validation.
 * Loads data/airports.json and builds indexes for ICAO and IATA codes.
 */
const AirportDB = (() => {
  let byICAO = {};    // "KJFK" → airport object
  let byIATA = {};    // "JFK"  → airport object
  let byLocal = {};   // "FFC", "8A1" → airport object (FAA local codes)
  let loaded = false;

  async function load() {
    if (loaded) return;
    const resp = await fetch('data/airports.json');
    const data = await resp.json();
    for (const [icao, info] of Object.entries(data)) {
      const airport = { icao, name: info.n, city: info.c, country: info.co, lat: info.la, lng: info.lo, iata: info.i || null, local: info.l || null };
      byICAO[icao.toUpperCase()] = airport;
      if (airport.iata) {
        byIATA[airport.iata.toUpperCase()] = airport;
      }
      if (airport.local) {
        const key = airport.local.toUpperCase();
        // US airports take priority for FAA local codes
        if (!byLocal[key] || airport.country === 'US') {
          byLocal[key] = airport;
        }
      }
    }
    loaded = true;
  }

  /** Look up by ICAO, IATA, or FAA local code (case-insensitive). Returns airport object or null. */
  function lookup(code) {
    const c = code.trim().toUpperCase();
    return byLocal[c] || byICAO[c] || byIATA[c] || null;
  }

  return { load, lookup };
})();

/**
 * Parse raw text into flight pairs (free-form input from textarea).
 * Accepts formats like:
 *   JFK-LHR   JFK LHR   JFK,LHR   JFK->LHR   JFK > LHR
 *   KJFK-EGLL  KJFK EGLL
 * One flight per line.
 * Returns array of { originRaw, destRaw, origin, dest, valid, error? }
 */
function parseFlights(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  return lines.map(line => parseSingleFlight(line, /\s*(?:->|=>|[,\-])\s*|\s+/));
}

/**
 * Parse an uploaded delimited file.
 * Detects delimiter from the first line, then applies it to all lines.
 * Returns { flights, error? }. If error is set, delimiter detection failed.
 */
function parseDelimitedFile(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { flights: [], error: 'File is empty' };

  const firstLine = lines[0];
  const delimiters = [
    { char: '\t', name: 'tab' },
    { char: ';',  name: 'semicolon' },
    { char: ',',  name: 'comma' },
    { char: ' ',  name: 'space' },
  ];

  // Score each delimiter: must split the first line into at least 2 non-empty parts
  const candidates = delimiters.filter(d => {
    const parts = firstLine.split(d.char).map(s => s.trim()).filter(Boolean);
    return parts.length >= 2;
  });

  if (candidates.length === 0) {
    return { flights: [], error: 'Could not detect delimiter in first line: ' + firstLine };
  }

  // Prefer tab > semicolon > comma > space (tab/semicolon are unambiguous;
  // comma beats space since airport codes can't contain commas)
  const chosen = candidates[0];
  const splitRe = chosen.char === ' ' ? /\s+/ : new RegExp('\\s*' + escapeRegex(chosen.char) + '\\s*');

  // Skip first line (header row)
  const flights = lines.slice(1).map(line => parseSingleFlight(line, splitRe));
  return { flights, delimiter: chosen.name };
}

/** Parse a single line into a flight result given a split pattern. */
function parseSingleFlight(line, splitPattern) {
  const parts = line.split(splitPattern).filter(Boolean);
  if (parts.length < 2) {
    return { raw: line, valid: false, error: 'Need origin and destination' };
  }
  const [originRaw, destRaw] = [parts[0], parts[1]];
  const origin = AirportDB.lookup(originRaw);
  const dest = AirportDB.lookup(destRaw);
  // Silently skip same-airport flights
  if (origin && dest && origin.icao === dest.icao) return { raw: line, skip: true };
  const errors = [];
  if (!origin) errors.push(`Unknown: ${originRaw}`);
  if (!dest) errors.push(`Unknown: ${destRaw}`);
  return {
    raw: line,
    originRaw,
    destRaw,
    origin,
    dest,
    valid: errors.length === 0,
    error: errors.join('; ') || undefined,
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
