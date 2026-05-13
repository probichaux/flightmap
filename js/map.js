/**
 * Map initialization, flight plotting, and PNG export.
 */
const FlightMap = (() => {
  /** Escape HTML metacharacters so airport data is safe in bindPopup strings. */
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let map;
  let flightLayer;   // LayerGroup holding all arcs + markers
  let plottedFlights = []; // stored for canvas-based export
  let tileLayer;
  let units = 'nm';  // 'nm' or 'km'

  const TILE_STYLES = {
    'dark':     { name: 'Dark',     url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>' },
    'light':    { name: 'Light',    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',                 attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>' },
    'voyager':  { name: 'Voyager',  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',       attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>' },
    'osm':      { name: 'Standard', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                             attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
    'esri-gray':{ name: 'Gray',     url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri', subdomains: [] },
  };

  const DEFAULT_STYLE = 'voyager';

  /** Initialise the Leaflet map. */
  function init() {
    map = L.map('map', { zoomControl: true, worldCopyJump: true }).setView([30, 0], 2);
    setStyle(DEFAULT_STYLE);
    flightLayer = L.layerGroup().addTo(map);
    return map;
  }

  /** Switch tile layer style. */
  function setStyle(key) {
    const style = TILE_STYLES[key];
    if (!style) return;
    if (tileLayer) map.removeLayer(tileLayer);
    const opts = { attribution: style.attribution, maxZoom: 18 };
    if (style.subdomains !== undefined) opts.subdomains = style.subdomains;
    tileLayer = L.tileLayer(style.url, opts).addTo(map);
  }

  /** Get the current tile URL template (for export). */
  function getTileUrl() {
    return tileLayer ? tileLayer._url : TILE_STYLES[DEFAULT_STYLE].url;
  }

  /** Get available styles for the picker. */
  function getStyles() { return TILE_STYLES; }
  function getDefaultStyle() { return DEFAULT_STYLE; }

  /** Remove all plotted flights. */
  function clear() {
    if (flightLayer) flightLayer.clearLayers();
    plottedFlights = [];
  }

  /**
   * Compute intermediate points along the great-circle arc between two coords.
   * Uses the spherical interpolation formula.
   */
  function greatCircleArc(lat1, lng1, lat2, lng2, numPoints) {
    const n = numPoints || 64;
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const φ1 = lat1 * toRad, λ1 = lng1 * toRad;
    const φ2 = lat2 * toRad, λ2 = lng2 * toRad;

    // Central angle via haversine
    const dφ = φ2 - φ1;
    const dλ = λ2 - λ1;
    const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
    const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (d < 1e-10) return [[lat1, lng1]]; // Same point

    const points = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const A = Math.sin((1 - f) * d) / Math.sin(d);
      const B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
      const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
      const z = A * Math.sin(φ1) + B * Math.sin(φ2);
      const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg;
      const lng = Math.atan2(y, x) * toDeg;
      points.push([lat, lng]);
    }
    return points;
  }

  /**
   * Make adjacent longitudes continuous (each within ±180° of the previous),
   * shifting by ±360° as needed. Output may extend outside [-180, 180]; Leaflet
   * with worldCopyJump renders these positions on the appropriate world copy.
   */
  function unwrapLngs(points) {
    if (points.length === 0) return points;
    const out = [points[0].slice()];
    for (let i = 1; i < points.length; i++) {
      const prevLng = out[i - 1][1];
      let lng = points[i][1];
      while (lng - prevLng > 180) lng -= 360;
      while (lng - prevLng < -180) lng += 360;
      out.push([points[i][0], lng]);
    }
    return out;
  }

  /** Great-circle distance in km. */
  function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLng = (lng2 - lng1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Get/set distance units ('nm' or 'km'). */
  function getUnits() { return units; }
  function setUnits(u) { units = u; }

  /** Format distance with commas and current unit. */
  function formatDist(km) {
    if (units === 'nm') {
      const nm = km / 1.852;
      return Math.round(nm).toLocaleString() + ' nm';
    }
    return Math.round(km).toLocaleString() + ' km';
  }

  const LINE_WEIGHT = 3;
  const ENDPOINT_COLOR = '#555';

  // Ordered low-to-high so callers can iterate for legends/etc.
  const VOLUME_BUCKETS = [
    { min: 1,  max: 1,        label: '1',     color: '#16a34a' },
    { min: 2,  max: 5,        label: '2–5',   color: '#2563eb' },
    { min: 6,  max: 10,       label: '6–10',  color: '#7c3aed' },
    { min: 11, max: 20,       label: '11–20', color: '#eab308' },
    { min: 21, max: Infinity, label: '21+',   color: '#dc2626' },
  ];

  function routeColor(count) {
    for (let i = VOLUME_BUCKETS.length - 1; i >= 0; i--) {
      if (count >= VOLUME_BUCKETS[i].min) return VOLUME_BUCKETS[i].color;
    }
    return VOLUME_BUCKETS[0].color;
  }

  /** Plot an array of validated flights. Returns array of { flight, distance }. */
  function plot(flights) {
    clear();
    const bounds = [];
    const results = [];

    // First pass: build per-flight results and group by route
    const routeMap = new Map(); // "ICAO|ICAO" → { origin, dest, count }
    for (const f of flights) {
      if (!f.valid) { results.push({ flight: f, distance: null }); continue; }
      const { origin, dest } = f;
      const dist = origin.icao === dest.icao ? 0 : distanceKm(origin.lat, origin.lng, dest.lat, dest.lng);
      results.push({ flight: f, distance: dist });

      const key = [origin.icao, dest.icao].sort().join('|');
      if (!routeMap.has(key)) {
        routeMap.set(key, { origin, dest, count: 0, sameAirport: origin.icao === dest.icao });
      }
      routeMap.get(key).count++;
    }

    // Second pass: draw one line per unique route, one marker per unique airport
    const airportMarkers = new Map(); // icao → airport

    for (const [, route] of routeMap) {
      const color = routeColor(route.count);

      if (route.sameAirport) {
        const markerOpts = { radius: 7, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9 };
        const popup = `<strong>${escHtml(route.origin.local || route.origin.iata || route.origin.icao)}</strong><br>${escHtml(route.origin.name)}<br>${escHtml(route.origin.city)}, ${escHtml(route.origin.country)}`;
        L.circleMarker([route.origin.lat, route.origin.lng], markerOpts).bindPopup(popup).addTo(flightLayer);
        bounds.push([route.origin.lat, route.origin.lng]);
        plottedFlights.push({ origin: route.origin, dest: route.dest, segments: [[[route.origin.lat, route.origin.lng]]], color, weight: LINE_WEIGHT });
      } else {
        const arc = unwrapLngs(greatCircleArc(route.origin.lat, route.origin.lng, route.dest.lat, route.dest.lng));
        const destLng = arc[arc.length - 1][1]; // possibly outside [-180, 180] for trans-antimeridian routes
        L.polyline(arc, { color, weight: LINE_WEIGHT, opacity: 0.85 }).addTo(flightLayer);
        bounds.push([route.origin.lat, route.origin.lng], [route.dest.lat, destLng]);
        const mid = arc[Math.floor(arc.length / 2)];
        if (mid) bounds.push(mid);
        plottedFlights.push({ origin: route.origin, dest: route.dest, segments: [arc], color, weight: LINE_WEIGHT });

        if (!airportMarkers.has(route.origin.icao)) airportMarkers.set(route.origin.icao, { airport: route.origin, lat: route.origin.lat, lng: route.origin.lng });
        if (!airportMarkers.has(route.dest.icao)) airportMarkers.set(route.dest.icao, { airport: route.dest, lat: route.dest.lat, lng: destLng });
      }
    }

    // Draw one neutral marker per unique endpoint airport (color is reserved for route volume).
    for (const { airport, lat, lng } of airportMarkers.values()) {
      const markerOpts = { radius: 5, fillColor: ENDPOINT_COLOR, color: '#fff', weight: 1.5, fillOpacity: 0.9 };
      const popup = `<strong>${escHtml(airport.local || airport.iata || airport.icao)}</strong><br>${escHtml(airport.name)}<br>${escHtml(airport.city)}, ${escHtml(airport.country)}`;
      L.circleMarker([lat, lng], markerOpts).bindPopup(popup).addTo(flightLayer);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 18 });
    }

    return results;
  }

  /** Load an image with CORS enabled. */
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /** Draw current tile layer onto a canvas at correct positions. */
  async function drawTiles(ctx) {
    const zoom = map.getZoom();
    const pixelBounds = map.getPixelBounds();
    const tileSize = 256;
    const urlTemplate = getTileUrl();
    const subdomains = tileLayer.options.subdomains || ['a', 'b', 'c'];

    const minTileX = Math.floor(pixelBounds.min.x / tileSize);
    const minTileY = Math.floor(pixelBounds.min.y / tileSize);
    const maxTileX = Math.ceil(pixelBounds.max.x / tileSize);
    const maxTileY = Math.ceil(pixelBounds.max.y / tileSize);

    const promises = [];
    let idx = 0;
    for (let tx = minTileX; tx < maxTileX; tx++) {
      for (let ty = minTileY; ty < maxTileY; ty++) {
        const s = subdomains.length ? subdomains[idx++ % subdomains.length] : '';
        const url = urlTemplate.replace('{s}', s).replace('{z}', zoom).replace('{x}', tx).replace('{y}', ty).replace('{r}', '');
        const canvasX = tx * tileSize - pixelBounds.min.x;
        const canvasY = ty * tileSize - pixelBounds.min.y;
        promises.push(
          loadImage(url)
            .then(img => ctx.drawImage(img, canvasX, canvasY, tileSize, tileSize))
            .catch(() => {}) // skip failed tiles
        );
      }
    }
    await Promise.all(promises);
  }

  /** Draw stored flight arcs and markers onto a canvas. */
  function drawFlights(ctx) {
    for (const pf of plottedFlights) {
      // Draw each segment as a separate path so antimeridian-split routes don't
      // backtrack across the canvas.
      ctx.strokeStyle = pf.color;
      ctx.lineWidth = pf.weight || 2.5;
      ctx.globalAlpha = 0.85;
      for (const seg of pf.segments) {
        if (seg.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < seg.length; i++) {
          const pt = map.latLngToContainerPoint(seg[i]);
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Draw markers — colored for same-airport routes, neutral for normal endpoints.
      const totalPoints = pf.segments.reduce((s, seg) => s + seg.length, 0);
      const sameAirport = totalPoints <= 1;
      const markerFill = sameAirport ? pf.color : ENDPOINT_COLOR;
      const markerRadius = sameAirport ? 7 : 5;
      const endpoints = sameAirport ? [pf.origin] : [pf.origin, pf.dest];
      for (const airport of endpoints) {
        const pt = map.latLngToContainerPoint([airport.lat, airport.lng]);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, markerRadius, 0, Math.PI * 2);
        ctx.fillStyle = markerFill;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  /** Export map as PNG by redrawing tiles and flights onto a fresh canvas. */
  async function exportPNG() {
    const size = map.getSize();
    const canvas = document.createElement('canvas');
    canvas.width = size.x;
    canvas.height = size.y;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size.x, size.y);

    await drawTiles(ctx);
    drawFlights(ctx);

    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'flightmap.png';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  return { init, clear, plot, exportPNG, distanceKm, formatDist, setStyle, getStyles, getDefaultStyle, getUnits, setUnits, getVolumeBuckets: () => VOLUME_BUCKETS };
})();
