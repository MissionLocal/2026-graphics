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
  mapboxgl.accessToken = "pk.eyJ1IjoibWxub3ciLCJhIjoiY21scG5hY2V5MHdwODNkcHRxb2Nhc2N5NyJ9.Ccmhr38K26uGXhVqe1yepA"; 
  const MAP_STYLE = "mapbox://styles/mlnow/cm2tndow500co01pw3fho5d21";
  const DATA_URL = "av-locations.geojson";

  // ---- Status color coding ----
  // Order here also drives the legend order (two per row, three rows).
  const STATUS_COLORS = {
    "Inactive":  "#A9A9A9",  // grey
    "Approved":  "#007dbc",  // blue
    "Active":    "#46c134",  // green
    "Denied":    "#f36e57",  // red
    "Withdrawn": "#d896ff",  // purple
    "Abandoned": "#ef9f6a"   // orange
  };
  const STATUS_DEFAULT = "#9aa0a6"; // fallback for any unexpected value
  const colorFor = (status) => STATUS_COLORS[status] || STATUS_DEFAULT;

  // Build a fresh Mapbox "match" expression from the color table.
  // Used for both the fill and the (full-opacity) stroke.
  const buildColorExpr = () => {
    const expr = ['match', ['get', 'Status']];
    for (const [status, color] of Object.entries(STATUS_COLORS)) expr.push(status, color);
    expr.push(STATUS_DEFAULT); // default
    return expr;
  };

  const infoBox = document.getElementById('info');

  // ---- helpers ----
  const esc = (v) => String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // A value we should treat as "no data"
  const has = (v) => {
    if (v === null || v === undefined) return false;
    const s = String(v).trim();
    return s !== "" && !/^(nan|na|n\/a|none|null|undefined|unlisted|unknown|uknown)$/i.test(s);
  };

  function tplInfo(p = {}) {
    const site = p["Site"];
    const status = p["Status"];
    const statusDetail = p["Status detail"];
    const operator = p["Owner/User"];
    const fleet = p["Fleet use"];
    const otherUse = p["Other use proposed/Approved use"];

    const statusPill = has(status)
      ? `<span class="status-pill"><span class="pill-dot" style="background:${colorFor(status)}"></span>${esc(status)}</span>`
      : "";

    const header = `
      <div class="info-header">
        <strong>${esc(site || "—")}</strong>
        ${statusPill}
      </div>`;

    // Show the owner line whenever there's any value — including "Unknown".
    // (Normalize the "Uknown" typo that appears in the data for display.)
    const ownerRaw = String(operator ?? "").trim();
    const ownerDisplay = /^(unknown|uknown)$/i.test(ownerRaw) ? "Unknown" : ownerRaw;
    const operatorLine = ownerDisplay
      ? `<div class="info-operator">User/Owner: ${esc(ownerDisplay)}</div>` : "";

    const rows = [];
    if (has(statusDetail)) rows.push(`<div class="row"><span class="label">Status detail:</span> ${esc(statusDetail)}</div>`);
    if (has(fleet))        rows.push(`<div class="row"><span class="label">Fleet use:</span> ${esc(fleet)}</div>`);
    if (has(otherUse))     rows.push(`<div class="row"><span class="label">Other use proposed/Approved use:</span> ${esc(otherUse)}</div>`);
    const stats = rows.length ? `<div class="info-stats">${rows.join("")}</div>` : "";

    return `${header}${operatorLine}${stats}`;
  }

  // ---- Legend ----
  function buildLegend() {
    const el = document.getElementById('legend');
    if (!el) return;
    el.innerHTML = Object.entries(STATUS_COLORS).map(([status, color]) => `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${color}"></span>
        <span class="legend-label">${esc(status)}</span>
      </div>`).join("");
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

  buildLegend();

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
        // Fill is coded to Status (rendered at 90% opacity below).
        'circle-color': buildColorExpr(),
        // Border is the same color at full opacity (stroke ignores circle-opacity).
        'circle-stroke-color': buildColorExpr(),
        // Thicken the ring on hover/selected.
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 2.5,
          ['boolean', ['feature-state', 'hover'], false], 2.5,
          1.5
        ],
        'circle-opacity': 0.9
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
