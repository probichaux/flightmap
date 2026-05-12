/**
 * Main application logic — wires up UI to validation and map modules.
 */
(async function () {
  // DOM refs
  const input = document.getElementById('flight-input');
  const plotBtn = document.getElementById('plot-btn');
  const clearBtn = document.getElementById('clear-btn');
  const fileInput = document.getElementById('file-input');
  const exportBtn = document.getElementById('export-btn');
  const status = document.getElementById('status');
  const skippedEl = document.getElementById('skipped-airports');
  const flightListEl = document.getElementById('flight-list');

  // Init
  const versionEl = document.getElementById('app-version');
  if (versionEl && window.APP_VERSION) versionEl.textContent = 'v' + window.APP_VERSION;
  FlightMap.init();
  renderLegend();
  await AirportDB.load();
  let lastResults = [];

  function setStatus(msg, type) {
    status.textContent = msg;
    status.className = type || '';
  }

  function renderLegend() {
    const el = document.getElementById('legend');
    if (!el) return;
    el.innerHTML = '';
    for (const b of FlightMap.getVolumeBuckets()) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="legend-swatch" style="background:${b.color}"></span>${b.label}`;
      el.appendChild(li);
    }
  }

  function renderSkippedAirports(flights) {
    const unknown = new Set();
    for (const f of flights) {
      if (f.valid) continue;
      if (f.originRaw && !f.origin) unknown.add(f.originRaw.toUpperCase());
      if (f.destRaw && !f.dest) unknown.add(f.destRaw.toUpperCase());
    }
    if (unknown.size === 0) {
      skippedEl.hidden = true;
      skippedEl.innerHTML = '';
      return;
    }
    const codes = [...unknown].sort();
    const label = `Unrecognized airport${codes.length > 1 ? 's' : ''}:`;
    skippedEl.innerHTML = `<span class="label">${label}</span> ` +
      codes.map(c => `<code>${c}</code>`).join('');
    skippedEl.hidden = false;
  }

  function renderFlightList(results) {
    flightListEl.innerHTML = '';
    for (const r of results) {
      const div = document.createElement('div');
      div.className = 'flight-item' + (r.flight.valid ? '' : ' invalid');
      if (r.flight.valid) {
        div.innerHTML = `
          <span class="codes">${r.flight.origin.local || r.flight.origin.iata || r.flight.origin.icao} &rarr; ${r.flight.dest.local || r.flight.dest.iata || r.flight.dest.icao}</span>
          <span class="distance">${FlightMap.formatDist(r.distance)}</span>`;
      } else {
        div.innerHTML = `<span class="codes">${r.flight.raw}</span><span class="distance">${r.flight.error}</span>`;
      }
      flightListEl.appendChild(div);
    }
  }

  function doPlot() {
    const text = input.value.trim();
    if (!text) { setStatus('Paste or upload flight pairs.', ''); return; }
    doPlotParsed(parseFlights(text));
  }

  function doPlotParsed(allFlights) {
    const flights = allFlights.filter(f => !f.skip);
    const validCount = flights.filter(f => f.valid).length;
    const invalidCount = flights.length - validCount;

    if (validCount === 0) {
      setStatus(`No valid flights found (${invalidCount} error${invalidCount > 1 ? 's' : ''}).`, 'error');
      renderSkippedAirports(flights);
      renderFlightList(flights.map(f => ({ flight: f, distance: null })));
      exportBtn.disabled = true;
      return;
    }

    const results = FlightMap.plot(flights);
    lastResults = results;
    const statusParts = [`${validCount} flight${validCount > 1 ? 's' : ''} plotted`];
    if (invalidCount > 0) statusParts.push(`${invalidCount} skipped`);
    setStatus(statusParts.join(', ') + '.', invalidCount > 0 ? '' : 'success');
    renderSkippedAirports(flights);
    renderFlightList(results);
    exportBtn.disabled = false;
  }

  function doClear() {
    input.value = '';
    FlightMap.clear();
    skippedEl.hidden = true;
    skippedEl.innerHTML = '';
    flightListEl.innerHTML = '';
    lastResults = [];
    setStatus('', '');
    exportBtn.disabled = true;
    updateInputButtons();
  }

  function updateInputButtons() {
    const hasText = input.value.trim().length > 0;
    plotBtn.disabled = !hasText;
    clearBtn.disabled = !hasText;
  }

  // Start with buttons disabled
  updateInputButtons();

  // Event listeners
  plotBtn.addEventListener('click', doPlot);
  clearBtn.addEventListener('click', doClear);
  input.addEventListener('input', updateInputButtons);

  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') doPlot();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseDelimitedFile(ev.target.result);
      if (result.error) {
        setStatus(result.error, 'error');
        return;
      }
      // Normalize pairs into the textarea so the freeform parser can re-parse them
      const lines = result.flights
        .filter(f => !f.skip)
        .map(f => f.originRaw && f.destRaw ? f.originRaw + '-' + f.destRaw : f.raw);
      input.value = lines.join('\n');
      // Plot using the already-parsed flights directly
      doPlotParsed(result.flights);
    };
    reader.readAsText(file);
    fileInput.value = ''; // allow re-uploading same file
  });

  exportBtn.addEventListener('click', async () => {
    setStatus('Exporting...', '');
    try {
      await FlightMap.exportPNG();
      setStatus('PNG downloaded.', 'success');
    } catch (err) {
      setStatus('Export failed: ' + err.message, 'error');
    }
  });

  // Units radio buttons
  document.querySelectorAll('input[name="units"]').forEach(radio => {
    radio.addEventListener('change', () => {
      FlightMap.setUnits(radio.value);
      // Re-render distances in the flight list
      if (lastResults.length > 0) renderFlightList(lastResults);
    });
  });

  // Style picker
  const stylePicker = document.getElementById('style-picker');
  const styles = FlightMap.getStyles();
  for (const [key, style] of Object.entries(styles)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = style.name;
    if (key === FlightMap.getDefaultStyle()) opt.selected = true;
    stylePicker.appendChild(opt);
  }
  stylePicker.addEventListener('change', () => FlightMap.setStyle(stylePicker.value));

  // Help modal
  const helpModal = document.getElementById('help-modal');
  function showHelp() { helpModal.classList.add('visible'); }
  function hideHelp() { helpModal.classList.remove('visible'); }
  document.getElementById('help-link').addEventListener('click', (e) => { e.preventDefault(); showHelp(); });
  helpModal.querySelector('.modal-close').addEventListener('click', hideHelp);
  helpModal.addEventListener('click', (e) => { if (e.target === helpModal) hideHelp(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideHelp(); });
})();
