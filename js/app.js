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

  // N-number lookup refs
  const nnumInput = document.getElementById('nnum-input');
  const nnumBtn = document.getElementById('nnum-btn');
  const openskyIdInput = document.getElementById('opensky-client-id');
  const openskySecretInput = document.getElementById('opensky-client-secret');

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
      skippedEl.replaceChildren();
      return;
    }
    const codes = [...unknown].sort();
    const label = `Unrecognized airport${codes.length > 1 ? 's' : ''}:`;

    skippedEl.replaceChildren();
    const labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    labelSpan.textContent = label;
    skippedEl.appendChild(labelSpan);
    skippedEl.appendChild(document.createTextNode(' '));
    for (const c of codes) {
      const code = document.createElement('code');
      code.textContent = c;
      skippedEl.appendChild(code);
    }
    skippedEl.hidden = false;
  }

  function renderFlightList(results) {
    flightListEl.replaceChildren();
    for (const r of results) {
      const div = document.createElement('div');
      div.className = 'flight-item' + (r.flight.valid ? '' : ' invalid');

      const codesSpan = document.createElement('span');
      codesSpan.className = 'codes';
      const distSpan = document.createElement('span');
      distSpan.className = 'distance';

      if (r.flight.valid) {
        const originCode = r.flight.origin.local || r.flight.origin.iata || r.flight.origin.icao;
        const destCode = r.flight.dest.local || r.flight.dest.iata || r.flight.dest.icao;
        codesSpan.textContent = originCode;
        codesSpan.appendChild(document.createTextNode(' '));
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        codesSpan.appendChild(arrow);
        codesSpan.appendChild(document.createTextNode(' ' + destCode));
        distSpan.textContent = FlightMap.formatDist(r.distance);
      } else {
        codesSpan.textContent = r.flight.raw;
        distSpan.textContent = r.flight.error || '';
      }

      div.appendChild(codesSpan);
      div.appendChild(distSpan);
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
    skippedEl.replaceChildren();
    flightListEl.replaceChildren();
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

  // Load saved OpenSky credentials
  const creds = OpenSky.getCredentials();
  openskyIdInput.value = creds.clientId;
  openskySecretInput.value = creds.clientSecret;
  openskyIdInput.addEventListener('change', () => {
    OpenSky.setCredentials(openskyIdInput.value, openskySecretInput.value);
  });
  openskySecretInput.addEventListener('change', () => {
    OpenSky.setCredentials(openskyIdInput.value, openskySecretInput.value);
  });

  // N-number fetch
  async function doNnumFetch() {
    const reg = nnumInput.value.trim();
    if (!reg) { setStatus('Enter a registration number.', 'error'); return; }

    nnumBtn.disabled = true;
    nnumBtn.textContent = 'Fetching...';
    setStatus('Fetching flights for ' + reg.toUpperCase() + '...', '');

    try {
      const flights = await OpenSky.fetchFlights(reg, (done, total) => {
        setStatus(`Fetching flights for ${reg.toUpperCase()}... (${done}/${total})`, '');
      });
      const lines = OpenSky.toFlightLines(flights);

      if (lines.length === 0) {
        setStatus('No flights with known airports found for ' + reg.toUpperCase() + '.', 'error');
        return;
      }

      // Populate textarea and plot
      input.value = lines.join('\n');
      updateInputButtons();
      doPlotParsed(parseFlights(input.value));
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      nnumBtn.disabled = false;
      nnumBtn.textContent = 'Fetch';
    }
  }

  nnumBtn.addEventListener('click', doNnumFetch);
  nnumInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doNnumFetch();
  });

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
