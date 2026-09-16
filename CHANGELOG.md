# Changelog

## 1.1.3 — 2026-09-16

### Added

- "Show routes" toggle in the sidebar (on by default); when off, airports
  are plotted without the connecting route lines, in both the map and PNG
  export

### Changed

- Flight volume legend moved from the sidebar to an overlay box in the
  bottom-left corner of the map. It is included in PNG exports and hidden
  when "Show routes" is off.
- Map styles now use Esri basemaps (Dark Gray, Light Gray, World Street Map)
  instead of CARTO, whose free tiles now carry an "API key required"
  watermark. The Voyager and Gray styles are replaced by Streets and Light;
  Streets is the new default.
- Content Security Policy no longer allows the CARTO tile host.

### Fixed

- Added airport 3ID9; aliased retired codes KHTO to KJPX and X68 to KTTS.

## 1.1.2 — 2026-06-02

### Added
- Airport dot size slider (range 2–12 px) in the sidebar; re-plots live when adjusted

## 0.1.0 — 2026-03-13

Initial release.

### Added
- Interactive flight route visualization on a Leaflet/OpenStreetMap map
- Support for ICAO, IATA, and FAA airport code input
- Paste flights directly or upload CSV/TXT files with auto-detected delimiters (comma, tab, semicolon, space)
- Bundled airport database with ~49,000 airports (large, medium, small, and seaplane bases)
- Great-circle arc rendering with per-flight distance calculation
- PNG export of the current map view
- Help modal explaining usage
- Contact link in navigation bar
- Responsive layout with collapsible sidebar on mobile
- Ad slot placeholder for future display ad integration
