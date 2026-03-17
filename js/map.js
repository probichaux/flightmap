/**
 * Map initialization, flight plotting, and PNG export.
 */
const FlightMap = (() => {
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

  const COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d'];

  /** Plot an array of validated flights. Returns array of { flight, distance }. */
  function plot(flights) {
    clear();
    const bounds = [];
    const results = [];
    let colorIdx = 0;

    for (const f of flights) {
      if (!f.valid) { results.push({ flight: f, distance: null }); continue; }
      const { origin, dest } = f;
      const color = COLORS[colorIdx % COLORS.length];
      colorIdx++;
      const sameAirport = origin.icao === dest.icao;

      if (sameAirport) {
        // Same-airport flight: plot as a single dot
        const markerOpts = { radius: 7, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9 };
        const popup = `<strong>${origin.local || origin.iata || origin.icao}</strong><br>${origin.name}<br>${origin.city}, ${origin.country}`;
        L.circleMarker([origin.lat, origin.lng], markerOpts).bindPopup(popup).addTo(flightLayer);
        bounds.push([origin.lat, origin.lng]);
        plottedFlights.push({ origin, dest, arc: [[origin.lat, origin.lng]], color });
        results.push({ flight: f, distance: 0 });
      } else {
        // Arc
        const arc = greatCircleArc(origin.lat, origin.lng, dest.lat, dest.lng);
        L.polyline(arc, { color, weight: 2.5, opacity: 0.8 }).addTo(flightLayer);

        // Markers
        const markerOpts = { radius: 5, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.9 };
        const popupOrigin = `<strong>${origin.local || origin.iata || origin.icao}</strong><br>${origin.name}<br>${origin.city}, ${origin.country}`;
        const popupDest = `<strong>${dest.local || dest.iata || dest.icao}</strong><br>${dest.name}<br>${dest.city}, ${dest.country}`;
        L.circleMarker([origin.lat, origin.lng], markerOpts).bindPopup(popupOrigin).addTo(flightLayer);
        L.circleMarker([dest.lat, dest.lng], markerOpts).bindPopup(popupDest).addTo(flightLayer);

        // Include endpoints and arc midpoint in bounds (arcs curve away from endpoints)
        bounds.push([origin.lat, origin.lng], [dest.lat, dest.lng]);
        const mid = arc[Math.floor(arc.length / 2)];
        if (mid) bounds.push(mid);
        const dist = distanceKm(origin.lat, origin.lng, dest.lat, dest.lng);
        plottedFlights.push({ origin, dest, arc, color });
        results.push({ flight: f, distance: dist });
      }
    }

    // Fit map tightly to show all flights
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
      // Draw arc
      ctx.beginPath();
      ctx.strokeStyle = pf.color;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < pf.arc.length; i++) {
        const pt = map.latLngToContainerPoint(pf.arc[i]);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Draw markers
      for (const airport of [pf.origin, pf.dest]) {
        const pt = map.latLngToContainerPoint([airport.lat, airport.lng]);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = pf.color;
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

  return { init, clear, plot, exportPNG, distanceKm, formatDist, setStyle, getStyles, getDefaultStyle, getUnits, setUnits };
})();
