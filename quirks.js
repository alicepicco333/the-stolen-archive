// Two marks of the archive's own voice, shared by the collection and the object page.
//
// Seal: an object's restitution status (perspectives.json) as a wax seal: a lumpy round blob of
// wax (an SVG path with a wobble fixed per object), a pressed inner ring, the inventory number
// and where the object is held on two arcs of the ring, and the status in the middle, set in
// Space Grotesk Bold. Orange wax while the object is held away, lilac once it has been returned (and
// the returned seal's ring is dashed, so the state reads by shape too). A slight tilt, fixed per
// object. The seal is an image with a text label for screen readers.
//
// Museum wording: the museum's own phrase struck through, with the plain version beside it
// (data/museum-wording.json). <del> and <ins> carry visually hidden prefixes, so a screen
// reader hears "Museum wording: acquired 1897. Plainly: seized in ...".

const Quirks = (() => {
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- seals ----------
  const angle = (no) => ((no * 47) % 9) - 4; // the same tilt for an object everywhere
  let uid = 0;

  // a closed, lumpy circle: points at a wobbling radius, joined by a smooth Catmull-Rom curve
  function blob(seed, r, amp, n = 15, cx = 60, cy = 60) {
    let x = (seed * 7919 + 17) % 233280;
    const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r + (rnd() - 0.5) * 2 * amp;
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    const P = (i) => pts[(i + n) % n];
    const f = (v) => v.toFixed(1);
    let d = `M${f(P(0)[0])} ${f(P(0)[1])}`;
    for (let i = 0; i < n; i++) {
      const p0 = P(i - 1); const p1 = P(i); const p2 = P(i + 1); const p3 = P(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
    }
    return `${d}Z`;
  }

  // the status in the middle: the part before " · ", in up to three short lines
  function lines(label) {
    const words = String(label).split(' · ')[0].toUpperCase().split(/\s+/);
    const out = [''];
    words.forEach((w) => {
      const cur = out[out.length - 1];
      if (cur && `${cur} ${w}`.length > 9) out.push(w);
      else out[out.length - 1] = cur ? `${cur} ${w}` : w;
    });
    return out.slice(0, 3);
  }

  const heldIn = (no) => {
    const o = typeof inventoryEntry === 'function' ? inventoryEntry(no) : null;
    return o && o.to ? o.to.label : 'various museums';
  };

  // Lettering: Space Grotesk Bold, in capitals. Two short upright arcs instead of a full circle
  // of text: where the object is on top ("HELD · LONDON", or "WAS IN · PARIS" once returned), its collection number
  // below. The status sits straight in the middle, sized to fit its longest line.
  function sealSVG(no, status) {
    const returned = status.kind === 'returned';
    const city = heldIn(no).split(',')[0].toUpperCase();
    const top = returned ? `WAS IN · ${city}` : `HELD · ${city}`;
    const id = `seal-${no}-${++uid}`;
    const ls = lines(status.label);
    const longest = Math.max(...ls.map((l) => l.length));
    // about 0.68em per capital (Space Grotesk Bold with 0.06em tracking) inside a 70-unit line
    const size = Math.max(12, Math.min(18, 70 / (longest * 0.68)));
    const step = size * 1.02;
    const y0 = 60 - ((ls.length - 1) * step) / 2 + size * 0.36;
    const tspans = ls.map((l, i) => `<tspan x="60" y="${(y0 + i * step).toFixed(1)}">${esc(l)}</tspan>`).join('');
    const arcSize = top.length > 14 ? 8.6 : 9.6;
    return `<svg class="seal__svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs>
        <path id="${id}-top" d="M20.5 60a39.5 39.5 0 0 1 79 0"/>
        <path id="${id}-bottom" d="M14 60a46 46 0 0 0 92 0"/>
      </defs>
      <path class="seal__wax" d="${blob(no, 55, 3.6)}"/>
      <path class="seal__lip" d="${blob(no + 5, 50, 1.6)}"/>
      <circle class="seal__press-light" cx="60.9" cy="60.9" r="36"/>
      <circle class="seal__press" cx="60" cy="60" r="36"/>
      <text class="seal__arc" font-size="${arcSize}" text-anchor="middle"><textPath href="#${id}-top" startOffset="50%">${esc(top)}</textPath></text>
      <text class="seal__arc" font-size="10" text-anchor="middle"><textPath href="#${id}-bottom" startOffset="50%">${String(no).padStart(3, '0')}</textPath></text>
      <text class="seal__word" text-anchor="middle" font-size="${size.toFixed(1)}">${tspans}</text>
    </svg>`;
  }
  function sealLabel(no, status) {
    const held = heldIn(no);
    return `Seal: ${status.label}. ${status.kind === 'returned' ? `Held in ${held} until its return.` : `Held in ${held}.`}`;
  }

  // fills an element with the seal (object page)
  function applyStamp(el, no, status) {
    if (!el || !status) return;
    el.className = `seal${status.kind === 'returned' ? ' seal--returned' : ''}`;
    el.style.setProperty('--seal-rot', `${angle(no)}deg`);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', sealLabel(no, status));
    el.removeAttribute('aria-hidden');
    el.innerHTML = sealSVG(no, status);
  }
  // the seal as markup (collection cards)
  function stampHTML(no, status) {
    if (!status) return '';
    return `<div class="seal${status.kind === 'returned' ? ' seal--returned' : ''}" role="img" aria-label="${esc(sealLabel(no, status))}" style="--seal-rot:${angle(no)}deg">${sealSVG(no, status)}</div>`;
  }

  let statuses = null;
  async function loadStatuses() {
    if (statuses) return statuses;
    try {
      const data = await (await fetch('perspectives.json')).json();
      statuses = {};
      Object.entries(data.objects || {}).forEach(([no, e]) => { if (e.status) statuses[no] = e.status; });
    } catch (e) { statuses = {}; }
    return statuses;
  }

  // ---------- museum wording ----------
  let pairs = null;
  async function loadWording() {
    if (pairs) return pairs;
    try { pairs = (await (await fetch('data/museum-wording.json')).json()).pairs || []; } catch (e) { pairs = []; }
    return pairs;
  }
  const wordingFor = (no, field) => (pairs || []).filter((p) => p.no === no && p.field === field);
  function wordingHTML(list) {
    return list.map((p) => `<span class="museum-wording"><del><span class="visually-hidden">Museum wording: </span>${esc(p.museum)}</del> <ins><span class="visually-hidden">. Plainly: </span>${esc(p.plain)}</ins></span>`).join('');
  }

  return { applyStamp, stampHTML, loadStatuses, loadWording, wordingFor, wordingHTML };
})();
