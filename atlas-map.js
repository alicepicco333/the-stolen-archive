// Leaflet "then → now" map used on the home page and the Atlas page:
// one point per place of origin, one square per holding city, an arc between them.
// Needs Leaflet and inventory.js.
//
//   const atlas = createAtlasMap(element, { onSelect: (no) => ... });
//   atlas.highlight(5);   // emphasise object 005's route (null clears)

function createAtlasMap(el, { onSelect, bounds = [[-45, -160], [66, 178]] } = {}) {
  if (!el || !window.L) return null;

  const map = L.map(el, {
    zoomSnap: 0, // smooth trackpad pinches; the buttons still step by 1
    zoomDelta: 1,
    maxZoom: 8,
    maxBounds: [[-58, -200], [85, 200]], // nothing is south of Wellington (41°S)
    worldCopyJump: false,
    scrollWheelZoom: false, // plain scrolling scrolls the page; pinches are handled below
    dragging: false,
    attributionControl: false,
  });

  // the whole map fits at the start: that is the furthest out it goes, and it only
  // needs dragging once zoomed in; back at the starting zoom it snaps to the full view
  let baseZoom = 0;
  function fit() {
    map.setMinZoom(0);
    map.fitBounds(bounds, { animate: false });
    baseZoom = map.getZoom();
    map.setMinZoom(baseZoom);
  }
  fit();
  map.on('zoomend', () => {
    if (map.getZoom() > baseZoom + 0.01) map.dragging.enable();
    else { map.dragging.disable(); map.fitBounds(bounds, { animate: false }); }
  });
  map.on('resize', () => { if (!map.dragging.enabled()) fit(); });
  // the map fills its column (it ends level with the text beside it), so its size can change
  // without a window resize, for example when the fonts arrive
  if ('ResizeObserver' in window) new ResizeObserver(() => map.invalidateSize({ animate: false })).observe(el);

  // trackpad pinch (and ctrl + mouse wheel) zooms around the pointer; browsers report a
  // pinch as a wheel event with ctrlKey. A two-finger scroll without it scrolls the page.
  let pinch = 0;
  let pinchAt = null;
  let frame = 0;
  el.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    pinch += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    pinchAt = map.mouseEventToContainerPoint(e);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const zoom = Math.min(map.getMaxZoom(), Math.max(baseZoom, map.getZoom() - pinch * 0.01));
      pinch = 0;
      if (Math.abs(zoom - map.getZoom()) > 0.001) map.setZoomAround(pinchAt, zoom, { animate: false });
    });
  }, { passive: false });

  let countries = null;
  function styleCountries() {
    if (!countries) return;
    const css = getComputedStyle(document.documentElement);
    countries.setStyle({
      fillColor: css.getPropertyValue('--bg-raised').trim(),
      fillOpacity: 1,
      color: css.getPropertyValue('--fg').trim(),
      weight: 0.6,
      opacity: 0.45,
    });
  }
  fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
    .then((r) => r.json())
    .then((data) => {
      // Antarctica left out: no object comes from or is held there
      countries = L.geoJSON(data, { interactive: false, filter: (f) => f.id !== 'ATA' }).addTo(map);
      countries.bringToBack();
      styleCountries();
    })
    .catch((err) => console.error('Could not load country outlines:', err));
  document.addEventListener('themechange', styleCountries);

  // curved line between two points: a quadratic Bézier bent to the side
  function arc(from, to, steps = 48) {
    const [lat1, lng1] = from;
    const [lat2, lng2] = to;
    const ctrl = [(lat1 + lat2) / 2 + (lng2 - lng1) * 0.22, (lng1 + lng2) / 2 - (lat2 - lat1) * 0.22];
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      pts.push([a * lat1 + b * ctrl[0] + c * lat2, a * lng1 + b * ctrl[1] + c * lng2]);
    }
    return pts;
  }

  // every item is a dot (site.css draws it in the middle); the icon box itself is the hit
  // area: 24px, 44px on touch. Objects from the same place sit in a tight cluster, each dot
  // nudged 7px along a small circle, so none hides another and no count badge is needed.
  const hit = window.matchMedia('(pointer: coarse)').matches ? 44 : 24;
  const placed = {};
  const icon = (cls, coords) => {
    let dx = 0;
    let dy = 0;
    if (coords) {
      const key = coords.join();
      const k = (placed[key] = (placed[key] || 0) + 1) - 1;
      if (k > 0) { dx = Math.round(7 * Math.cos(k * 2.1)); dy = Math.round(7 * Math.sin(k * 2.1)); }
    }
    return L.divIcon({ className: cls, iconSize: [hit, hit], iconAnchor: [hit / 2 - dx, hit / 2 - dy] });
  };
  const arcs = {};
  const origins = {};
  const holders = new Set();

  // ---------- the pop-up ----------
  // One pop-up per map, placed at body level (position: fixed) at the marker's screen
  // position, so the map's clipped edge never cuts it. It flips below the marker near the
  // top of the screen, shifts inward near the sides, follows the marker while the map is
  // zoomed or dragged and hides when the marker leaves the map or the screen.
  // Pointer: it opens on hover or keyboard focus. Touch: a tap docks it to the bottom of the
  // screen with a link and a close button. Escape closes it.
  const touch = window.matchMedia('(hover: none)');
  const pop = document.createElement('div');
  pop.className = 'atlas-tip atlas-pop';
  pop.id = `atlas-pop-${Math.random().toString(36).slice(2, 8)}`;
  pop.setAttribute('role', 'tooltip');
  pop.hidden = true;
  document.body.appendChild(pop);
  let open = null; // { marker, href }

  function placePop() {
    if (!open || pop.hidden || pop.classList.contains('is-docked')) return;
    const box = el.getBoundingClientRect();
    const p = map.latLngToContainerPoint(open.marker.getLatLng());
    const x = box.left + p.x;
    const y = box.top + p.y;
    const outside = p.x < 0 || p.y < 0 || p.x > box.width || p.y > box.height || y < 0 || y > window.innerHeight;
    pop.style.visibility = outside ? 'hidden' : '';
    if (outside) return;
    const m = 8;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let top = y - 14 - h;                                     // above the marker
    if (top < m) top = y + 14;                                // no room above: below it
    top = Math.max(m, Math.min(top, window.innerHeight - m - h));
    const left = Math.max(m, Math.min(x - w / 2, window.innerWidth - m - w));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }
  function showPop(marker, html, href, docked) {
    open = { marker, href };
    pop.classList.toggle('is-docked', docked);
    pop.setAttribute('role', docked ? 'dialog' : 'tooltip');
    pop.innerHTML = html + (docked ? `<p class="atlas-pop__actions">${href ? `<a class="btn btn--signal" href="${href}">Open the object page</a>` : ''}<button type="button" class="btn">Close</button></p>` : '');
    pop.hidden = false;
    marker.getElement()?.setAttribute('aria-describedby', pop.id);
    if (docked) {
      pop.style.left = ''; pop.style.top = ''; pop.style.visibility = '';
      pop.querySelector('button').addEventListener('click', () => { const mk = open?.marker; hidePop(); mk?.getElement()?.focus(); });
    } else placePop();
  }
  function hidePop() {
    if (!open) return;
    open.marker.getElement()?.removeAttribute('aria-describedby');
    open = null;
    pop.hidden = true;
  }
  map.on('move zoom resize', placePop);
  window.addEventListener('scroll', placePop, { passive: true });
  window.addEventListener('resize', placePop);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !open) return;
    const mk = open.marker;
    const docked = pop.classList.contains('is-docked');
    hidePop();
    if (docked) mk.getElement()?.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    if (open && pop.classList.contains('is-docked') && !pop.contains(e.target) && !el.contains(e.target)) hidePop();
  });

  // pointer: hover or focus shows it; touch: a first tap docks it, a second tap on the same marker follows the link
  function bindPop(marker, html, href, select) {
    marker.on('mouseover focus', () => { if (!touch.matches) showPop(marker, html, href, false); });
    marker.on('mouseout blur', () => { if (!touch.matches && open?.marker === marker) hidePop(); });
    marker.on('click keypress', (e) => {
      const key = e.originalEvent?.key;
      if (e.type === 'keypress' && key !== 'Enter') return;
      if (touch.matches && !(open?.marker === marker && pop.classList.contains('is-docked'))) {
        showPop(marker, html, href, true);
        return;
      }
      if (select) select();
    });
  }

  INVENTORY.forEach((o) => {
    const label = `${invNo(o.no)} ${o.title}`;
    const origin = L.marker(o.from.coords, { icon: icon('atlas-origin', o.from.coords), title: `${label}: taken from ${o.from.label}`, keyboard: true }).addTo(map);
    bindPop(origin, `${label}<br>from ${o.from.label}<br>${o.returned ? `held in ${o.to.label}<br>${o.returned}` : `now ${o.to ? o.to.label : 'in various museums'}`}`,
      `Object-page.html?no=${o.no}`, onSelect ? () => onSelect(o.no) : null);
    origin.on('mouseover focus', () => highlight(o.no));
    origin.on('mouseout blur', () => highlight(null));
    origins[o.no] = origin;

    if (!o.to || o.to.coords.join() === o.from.coords.join()) return; // no single destination, or never left
    arcs[o.no] = L.polyline(arc(o.from.coords, o.to.coords), { className: `atlas-arc${o.returned ? ' is-returned' : ''}`, weight: 1.5, interactive: false }).addTo(map);

    if (!holders.has(o.to.label)) {
      holders.add(o.to.label);
      const here = INVENTORY.filter((x) => x.to && x.to.label === o.to.label);
      const held = here.map((x) => `${invNo(x.no)} ${x.title}${x.returned ? ' <i>(since returned)</i>' : ''}`);
      // a city whose objects have all gone back is a former holder: hollow square
      const former = here.every((x) => x.returned);
      const holder = L.marker(o.to.coords, { icon: icon(`atlas-holder${former ? ' is-former' : ''}`), title: `${former ? 'Formerly held in' : 'Held in'} ${o.to.label}`, keyboard: true })
        .addTo(map);
      // on touch the docked list links to each object
      const linked = here.map((x) => `<a href="Object-page.html?no=${x.no}">${invNo(x.no)} ${x.title}</a>${x.returned ? ' <i>(since returned)</i>' : ''}`);
      holder.on('mouseover focus', () => { if (!touch.matches) showPop(holder, `<b>${o.to.label}</b><br>${held.join('<br>')}`, null, false); });
      holder.on('mouseout blur', () => { if (!touch.matches && open?.marker === holder) hidePop(); });
      holder.on('click', () => { if (touch.matches) showPop(holder, `<b>${o.to.label}</b><br>${linked.join('<br>')}`, null, true); });
    }
  });

  function highlight(no) {
    Object.entries(arcs).forEach(([n, line]) => {
      const el = line.getElement();
      if (!el) return;
      el.classList.toggle('is-active', Number(n) === no);
      el.classList.toggle('is-dimmed', no !== null && Number(n) !== no);
    });
    Object.entries(origins).forEach(([n, m]) => {
      const el = m.getElement();
      if (el) el.classList.toggle('is-active', Number(n) === no);
    });
  }

  return { map, highlight };
}
