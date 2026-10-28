// map.js — Halloween 2026: car-free streets (lines) + Halloween events (pumpkin icons)
document.addEventListener('DOMContentLoaded', () => {
  // Optional Pym
  let pymChild = null;
  try { if (window.pym) pymChild = new pym.Child(); } catch {}

  mapboxgl.accessToken = "pk.eyJ1IjoibWxub3ciLCJhIjoiY21scG5hY2V5MHdwODNkcHRxb2Nhc2N5NyJ9.Ccmhr38K26uGXhVqe1yepA";

  // ---- DOM
  const infoBox = document.getElementById('info-box');

  // ---- Map
  const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mlnow/cmhcjcs6y003s01smeip27ohd",
  center: [-122.45, 37.765],
  zoom: 11.27,
  minZoom: 11.27,                 // how far out readers can zoom
  maxBounds: [
    [-122.56, 37.68],            // southwest corner [lng, lat]
    [-122.33, 37.85]             // northeast corner [lng, lat]
  ]
});

  // ======================= CONFIG =======================
  const CLOSURES_PATH = 'street_closures_2026.geojson';
  const EVENTS_PATH   = 'halloween_events_2026.geojson';

  const LINE_COLOR  = '#ff964f';
  const HOVER_COLOR = '#ffb380';

  const HIT_WIDTHS = [
    'interpolate', ['linear'], ['zoom'],
    8, 10,
    12, 18,
    14, 24
  ];

  const IS_MOBILE = window.matchMedia('(max-width: 640px)').matches;

  // ======================= Helpers =======================
  const key = v => (v == null ? '' : String(v).trim());

  const esc = s => key(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // The events file has keys like "Time ", "Where ", "Description".
  // Normalize them to clean lowercase names: time, where, description, ...
  function cleanProps(p = {}) {
    const out = {};
    for (const [k, v] of Object.entries(p)) {
      const nk = k.trim().replace(/\?/g, '').toLowerCase().replace(/\s+/g, '_');
      out[nk] = typeof v === 'string' ? v.trim() : v;
    }
    return out;
  }

  // "42ND AVE between LINCOLN WAY and IRVING ST" -> "42nd Ave. between Lincoln Way and Irving St."
  const SPECIAL = { OFARRELL: "O'Farrell" };
  function prettyStreet(s) {
    s = key(s);
    if (!s) return '';
    if (/^START:\s*1-99 BLOCK$/i.test(s)) return 'the start of the street';
    if (/^street end$/i.test(s)) return 'the end of the street';
    return s.split(/\s+/).map(w => {
      const up = w.toUpperCase();
      if (SPECIAL[up]) return SPECIAL[up];
      if (/^\d+(ST|ND|RD|TH)$/.test(up)) return up.replace(/^0+/, '').toLowerCase();
      if (['ST', 'AVE', 'DR', 'BLVD'].includes(up)) return up.charAt(0) + up.slice(1).toLowerCase() + '.';
      return up.charAt(0) + up.slice(1).toLowerCase();
    }).join(' ');
  }

  function closureWhere(p) {
    const street = prettyStreet(p.street);
    const from = prettyStreet(p.from);
    const to = prettyStreet(p.to);
    if (street && from && to) return `${street} between ${from} and ${to}`;
    return prettyStreet(p.name);
  }

  const safeLink = u => /^https?:\/\//i.test(key(u)) ? key(u) : '';

  const showInfoBox = () => {
    infoBox.style.display = 'block';
    infoBox.scrollTop = 0;
    requestAnimationFrame(() => { try { pymChild?.sendHeight(); } catch {} });
  };
  const hideInfoBox = () => {
    infoBox.style.display = 'none';
    requestAnimationFrame(() => { try { pymChild?.sendHeight(); } catch {} });
  };

  const closeBtn = `<button class="info-close" type="button" aria-label="Close">×</button>`;

  function tplClosure(p = {}) {
    const purpose = key(p.purpose) || 'Street closure';
    const where = closureWhere(p);
    const hood = key(p.neighborhood);
    const time = key(p.time);
    const link = safeLink(p.link);
    return `
      ${closeBtn}
      <div class="info-title-row">
        <div class="event"><strong>CAR-FREE STREET</strong></div>
      </div>
      <div class="info-desc">
        <strong>🎃 What for:</strong> ${link
          ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(purpose)} ↗</a>`
          : esc(purpose)}<br/>
        ${time ? `<strong>🕐 When:</strong> ${esc(time)}<br/>` : ``}
        ${where ? `<strong>📍 Where:</strong> ${esc(where)}${hood ? ` (${esc(hood)})` : ``}` : ``}
      </div>
    `;
  }

  function tplEvent(p = {}) {
    const title = key(p.what) || 'Halloween event';
    const desc = key(p.description);
    const time = key(p.time);
    const where = key(p.where);
    const hood = key(p.neighborhood);
    const cost = key(p.cost);
    const link = safeLink(p.event_link);
    return `
      ${closeBtn}
      <div class="info-title-row">
        <div class="event"><strong>🎃 ${esc(title)}</strong></div>
      </div>
      <div class="info-desc">
        ${desc ? `<p>${esc(desc)}</p>` : ``}
        ${time ? `<strong>🕐 When:</strong> ${esc(time)}<br/>` : ``}
        ${where ? `<strong>📍 Where:</strong> ${esc(where)}${hood ? ` (${esc(hood)})` : ``}<br/>` : ``}
        ${cost ? `<strong>🎟️ Cost:</strong> ${esc(cost)}<br/>` : ``}
        ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Event details ↗</a>` : ``}
      </div>
    `;
  }

  // Pumpkin icon: draw the 🎃 emoji onto a canvas so it doesn't depend on
  // the map style's fonts (Mapbox text glyphs can't render emoji).
  function makePumpkinImage(sizePx = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = sizePx;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(sizePx * 0.8)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText('🎃', sizePx / 2, sizePx / 2 + sizePx * 0.04);
    return ctx.getImageData(0, 0, sizePx, sizePx);
  }

  async function loadJSON(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
    return r.json();
  }

  // ======================= Map layers =======================
  map.on('load', async () => {
    let closures, events;
    try {
      [closures, events] = await Promise.all([loadJSON(CLOSURES_PATH), loadJSON(EVENTS_PATH)]);
    } catch (err) {
      console.error(err);
      return;
    }

    events.features = events.features
      .filter(f => f.geometry)
      .map(f => ({ ...f, properties: cleanProps(f.properties) }));

    map.addSource('closures', { type: 'geojson', data: closures, generateId: true });
    map.addSource('events', { type: 'geojson', data: events, generateId: true });

    map.addImage('pumpkin', makePumpkinImage(64), { pixelRatio: 2 });

    // --- Closures: visual line
    map.addLayer({
      id: 'closures-line',
      type: 'line',
      source: 'closures',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], HOVER_COLOR,
          LINE_COLOR
        ],
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          8, ['case', ['boolean', ['feature-state', 'hover'], false],
              IS_MOBILE ? 3.0 : 2.5, IS_MOBILE ? 1.6 : 1.2],
          12, ['case', ['boolean', ['feature-state', 'hover'], false],
              IS_MOBILE ? 5.0 : 4.0, IS_MOBILE ? 3.0 : 2.0],
          14, ['case', ['boolean', ['feature-state', 'hover'], false],
              IS_MOBILE ? 7.0 : 6.0, IS_MOBILE ? 4.2 : 3.0]
        ],
        'line-opacity': 0.9
      }
    });

    // --- Closures: wide invisible hit layer for easy taps
    map.addLayer({
      id: 'closures-hit',
      type: 'line',
      source: 'closures',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-width': HIT_WIDTHS, 'line-color': '#000000', 'line-opacity': 0.001 }
    });

    // --- Events: glow behind the hovered/selected pumpkin
    map.addLayer({
      id: 'events-glow',
      type: 'circle',
      source: 'events',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 11, 14, 18],
        'circle-color': LINE_COLOR,
        'circle-blur': 0.6,
        'circle-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 0.75,
          0
        ]
      }
    });

    // --- Events: pumpkin icons (always shown, even when overlapping)
    map.addLayer({
      id: 'events-icon',
      type: 'symbol',
      source: 'events',
      layout: {
        'icon-image': 'pumpkin',
        'icon-size': ['interpolate', ['linear'], ['zoom'],
            10, IS_MOBILE ? 0.5 : 0.45,
            13, IS_MOBILE ? 0.75 : 0.65,
            16, 1.25],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    });

    try {
      if (map.getLayer('road-label-navigation')) map.moveLayer('road-label-navigation', 'events-glow');
      if (map.getLayer('settlement-subdivision-label')) map.moveLayer('settlement-subdivision-label', 'events-glow');
    } catch {}

    // ======================= Interactions =======================
    // Pumpkins sit on top, so they win when they overlap a street.
    const HIT_LAYERS = ['events-icon', 'closures-hit'];
    let hovered = null; // { source, id }

    function setHover(target, on) {
      if (!target) return;
      try { map.setFeatureState(target, { hover: !!on }); } catch {}
    }
    function hoverFeature(f) {
      const next = { source: f.source, id: f.id };
      if (hovered && (hovered.source !== next.source || hovered.id !== next.id)) setHover(hovered, false);
      hovered = next;
      setHover(hovered, true);
    }
    function clearHover() {
      setHover(hovered, false);
      hovered = null;
    }
    const topFeature = point => map.queryRenderedFeatures(point, { layers: HIT_LAYERS })[0];

    map.on('mousemove', (e) => {
      const f = topFeature(e.point);
      map.getCanvas().style.cursor = f ? 'pointer' : '';
      if (f) hoverFeature(f);
      else if (hovered && infoBox.style.display !== 'block') clearHover();
    });

    map.on('touchstart', (e) => {
      const f = topFeature(e.point);
      if (f) hoverFeature(f);
    });

    map.on('click', (e) => {
      const f = topFeature(e.point);
      if (!f) {
        hideInfoBox();
        clearHover();
        return;
      }
      hoverFeature(f);
      const props = f.properties || {};
      infoBox.innerHTML = f.source === 'events' ? tplEvent(props) : tplClosure(props);
      showInfoBox();
    });

    infoBox.addEventListener('click', (e) => {
      if (e.target.closest('.info-close')) {
        hideInfoBox();
        clearHover();
      }
    });

    Promise.all([
      new Promise(r => map.once('idle', r)),
      (document.fonts?.ready ?? Promise.resolve())
    ]).then(() => {
      requestAnimationFrame(() => { try { pymChild?.sendHeight(); } catch {} });
    });
  });

  window.addEventListener('resize', () => map.resize());
});
