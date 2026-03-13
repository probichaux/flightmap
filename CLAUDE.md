# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlightMap is a single-page application that visualizes flights on an interactive map. Users paste or upload airport codes (ICAO or IATA/FAA), the app validates them, and plots great-circle routes between origin/destination pairs on a map. Users can pan, zoom, and export the map as an image.

## Architecture

- **Static SPA** — plain HTML/CSS/JS (or minimal framework). No server-side rendering. Hosted as static files to minimize operating cost.
- **Map rendering** — Leaflet.js with OpenStreetMap tiles (free, no API key required). Great-circle arcs drawn with geodesic polylines.
- **Airport data** — bundled JSON lookup table mapping ICAO and IATA codes to coordinates and names. No runtime API calls for code resolution.
- **Export** — html2canvas or leaflet-image for map-to-PNG download.
- **Ad slots** — reserved `<div>` placeholders in the layout for future display ad integration (e.g., Google AdSense). No ad code loaded until configured.

## Design Principles

- Clean, light visual design. White/light-grey backgrounds, neutral accents. No purple, no "AI theme."
- Minimal dependencies. Every added library must justify its weight.
- Works offline after initial load (airport data is bundled, map tiles are the only external dependency).

## Input Formats

The app accepts airport codes in two formats:
- **ICAO** (4-letter): KJFK, EGLL, LFPG
- **IATA/FAA** (3-letter): JFK, LHR, CDG

Flights are specified as origin-destination pairs, one per line (e.g., `JFK-LHR` or `KJFK-EGLL`). The parser should be flexible with delimiters (dash, comma, space, arrow).

## Project Structure

```
index.html          — single entry point
css/style.css       — all styles
js/app.js           — main application logic (input parsing, UI)
js/map.js           — map initialization, flight plotting, export
js/validate.js      — airport code lookup and validation
data/airports.json  — bundled airport database (code → lat/lng/name)
```

## Development

Serve locally with any static file server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

No build step. No bundler. Open `http://localhost:8000` in a browser.

## Key Constraints

- No backend. All logic runs client-side.
- No API keys required for core functionality.
- Airport database is checked into the repo — do not fetch from external APIs at runtime.
- Keep total bundle size small; the airports JSON is the largest asset.
