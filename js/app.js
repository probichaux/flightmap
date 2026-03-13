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
  const flightListEl = document.getElementById('flight-list');

  // Init
  FlightMap.init();
  await AirportDB.load();

  function setStatus(msg, type) {
    status.textContent = msg;
    status.className = type || '';
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
      renderFlightList(flights.map(f => ({ flight: f, distance: null })));
      exportBtn.disabled = true;
      return;
    }

    const results = FlightMap.plot(flights);
    const statusParts = [`${validCount} flight${validCount > 1 ? 's' : ''} plotted`];
    if (invalidCount > 0) statusParts.push(`${invalidCount} skipped`);
    setStatus(statusParts.join(', ') + '.', invalidCount > 0 ? '' : 'success');
    renderFlightList(results);
    exportBtn.disabled = false;
  }

  function doClear() {
    input.value = '';
    FlightMap.clear();
    flightListEl.innerHTML = '';
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

  // Help modal
  const helpModal = document.getElementById('help-modal');
  function showHelp() { helpModal.classList.add('visible'); }
  function hideHelp() { helpModal.classList.remove('visible'); }
  document.getElementById('help-link').addEventListener('click', (e) => { e.preventDefault(); showHelp(); });
  helpModal.querySelector('.modal-close').addEventListener('click', hideHelp);
  helpModal.addEventListener('click', (e) => { if (e.target === helpModal) hideHelp(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideHelp(); });
})();
