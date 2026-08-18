document.addEventListener('DOMContentLoaded', () => {
  let pymChild = null;
  try { if (window.pym) pymChild = new pym.Child(); } catch {}

  function sendOnceAfterStyleLoad(map) {
    if (!pymChild) return;
    const onStyleLoad = new Promise(res => {
      if (map.isStyleLoaded && map.isStyleLoaded()) res();
      else map.once('load', res);
    });
    Promise.all([onStyleLoad, (document.fonts?.ready ?? Promise.resolve())]).then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => { try { pymChild.sendHeight(); } catch {} }, 80);
        });
      });
    });
  }

  // ---- CONFIG ----
  mapboxgl.accessToken = "pk.eyJ1IjoibWxub3ciLCJhIjoiY21scG5hY2V5MHdwODNkcHRxb2Nhc2N5NyJ9.Ccmhr38K26uGXhVqe1yepA"; // <-- using the 2026-graphics token for now
  const MAP_STYLE = "mapbox://styles/mlnow/cm2tndow500co01pw3fho5d21";
  const DATA_URL = "av-locations.geojson";

  // House dot color (single color — not coded to any field)
  const DOT_COLOR = "#007DBC";
  const DOT_COLOR_ACTIVE = "#005892";

  const infoBox = document.getElementById('info');

  // ---- helpers ----
  const esc = (v) => String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // A value we should treat as "no data"
  const has = (v) => {
    if (v === null || v === undefined) return false;
    const s = String(v).trim();
    return s !== "" && !/^(nan|na|n\/a|none|null|undefined|unlisted)$/i.test(s);
  };

  function tplInfo(p = {}) {
    const site = p["Site Address"];
    const operator = p["Operator / User"];
    const fleet = p["Stated Fleet Use"];
    const landUse = p["Proposed / Approved Land Use"];
    const status = p["Planning Status and Policy Conflict"];
    const addr = p["matched_address"];

    const header = `
      <div class="info-header">
        <strong>${esc(site || "—")}</strong>
        ${has(operator) ? `<span class="sep">•</span><span class="info-operator">${esc(operator)}</span>` : ""}
      </div>`;

    const addressLine = has(addr) ? `<div class="info-address">${esc(addr)}</div>` : "";

    const rows = [];
    if (has(fleet))   rows.push(`<div class="row"><span class="label">Stated use:</span> ${esc(fleet)}</div>`);
    if (has(landUse)) rows.push(`<div class="row"><span class="label">Proposed / approved land use:</span> ${esc(landUse)}</div>`);
    const stats = rows.length ? `<div class="info-stats">${rows.join("")}</div>` : "";

    const desc = has(status) ? `<div class="info-desc">${esc(status)}</div>` : "";

    return `${header}${addressLine}${stats}${desc}`;
  }

  let hoveredId = null;
  let selectedId = null;

  function setHover(id) {
    if (hoveredId !== null) map.setFeatureState({ source: 'av', id: hoveredId }, { hover: false });
    hoveredId = id;
    if (hoveredId !== null) map.setFeatureState({ source: 'av', id: hoveredId }, { hover: true });
    map.getCanvas().style.cursor = id !== null ? 'pointer' : '';
  }

  function setSelected(id) {
    if (selectedId !== null) map.setFeatureState({ source: 'av', id: selectedId }, { selected: false });
    selectedId = id;
    if (selectedId !== null) map.setFeatureState({ source: 'av', id: selectedId }, { selected: true });
  }

  function revealInfo(html) {
    infoBox.innerHTML = html;
    infoBox.style.display = 'block';
  }
  function hideInfo() {
    if (infoBox.style.display !== 'none') infoBox.style.display = 'none';
    setSelected(null);
  }

  // ---- Map ----
  const map = new mapboxgl.Map({
    container: 'map',
    style: MAP_STYLE,
    center: [-122.4304, 37.7663], // SF; refined by fitBounds once data loads
    zoom: 11.5
  });
  map.on('error', e => console.error('Mapbox GL error:', e && e.error));

  map.on('load', async () => {
    let data;
    try {
      data = await (await fetch(DATA_URL)).json();
    } catch (err) {
      console.error('Could not load ' + DATA_URL, err);
      return;
    }

    map.addSource('av', { type: 'geojson', data, generateId: true });

    map.addLayer({
      id: 'av-dots',
      type: 'circle',
      source: 'av',
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          10, ['case', ['boolean', ['feature-state', 'selected'], false], 6.5,
                        ['boolean', ['feature-state', 'hover'], false], 6, 4.5],
          15, ['case', ['boolean', ['feature-state', 'selected'], false], 11,
                        ['boolean', ['feature-state', 'hover'], false], 10, 8]
        ],
        'circle-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], DOT_COLOR_ACTIVE,
          ['boolean', ['feature-state', 'hover'], false], DOT_COLOR_ACTIVE,
          DOT_COLOR
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.95
      }
    });

    // Frame all points
    try {
      const b = new mapboxgl.LngLatBounds();
      for (const f of data.features) b.extend(f.geometry.coordinates);
      map.fitBounds(b, { padding: 48, maxZoom: 15, duration: 0 });
    } catch {}

    // Hover
    map.on('mousemove', 'av-dots', e => {
      if (!e.features?.length) return;
      setHover(e.features[0].id);
    });
    map.on('mouseleave', 'av-dots', () => setHover(null));

    // Click a dot → open info box
    map.on('click', 'av-dots', e => {
      const f = e.features?.[0];
      if (!f) return;
      setSelected(f.id);
      revealInfo(tplInfo(f.properties || {}));
    });

    // Click empty basemap → hide info box
    map.on('click', e => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['av-dots'] });
      if (!hit.length) hideInfo();
    });

    sendOnceAfterStyleLoad(map);
  });

  // Keep the canvas sized correctly
  window.addEventListener('resize', () => { try { map.resize(); } catch {} }, { passive: true });
});
