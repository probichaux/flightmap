# FlightMap

A lightweight single-page application that visualizes flight routes on an interactive map. Paste or upload airport code pairs and see great-circle routes drawn instantly.

## Features

- **Multiple code formats** — accepts ICAO (KJFK), IATA (JFK), and FAA identifiers (FFC, 8A1)
- **Flexible input** — paste flights directly or upload CSV/TXT files with auto-detected delimiters
- **49,000+ airports** — bundled database covering large, medium, and small airports plus seaplane bases worldwide
- **Great-circle routes** — accurate geodesic arcs with per-flight distance display
- **Interactive map** — pan, zoom, and click markers for airport details
- **PNG export** — download the current map view as an image
- **No backend required** — runs entirely in the browser as static files

## Quick Start

Serve the files with any static HTTP server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Open `http://localhost:8000` and enter flight pairs in the sidebar:

```
JFK-LHR
LAX NRT
KJFK, EGLL
SFO -> SIN
```

Or upload a delimited file (CSV, TSV, etc.) with origin and destination columns. The first row is treated as a header.

## Input Formats

**Paste** — one flight per line, codes separated by dash, comma, space, or arrow.

**Upload** — two-column delimited file. Comma, tab, semicolon, and space delimiters are auto-detected from the header row.

## Project Structure

```
index.html          Single entry point
css/style.css       All styles
js/app.js           UI wiring and event handling
js/map.js           Leaflet map, route plotting, PNG export
js/validate.js      Airport lookup and input parsing
data/airports.json  Bundled airport database (~4.3 MB)
```

## Dependencies

All loaded from CDN at runtime — no build step, no bundler:

- [Leaflet](https://leafletjs.com/) 1.9.4 — map rendering
- [OpenStreetMap](https://www.openstreetmap.org/) — tile layer

## License

Private repository. All rights reserved.
