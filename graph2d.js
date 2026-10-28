// Object page: the RDF metadata as a 2D node-link graph (d3, tree layout).
// The object is the root on the left; its statements branch out in five plain groups
// (made, origin, removal, today, described as) and end in one node per value. A value
// that has statements of its own (a place, a museum, an event) shows +N and opens into a
// further branch; a value with a long text (a description) opens a note with all of it.
// Hovering any node lights the path back to the object.
// graphs/NN.json is made from the object's RDF file by tools/rdf_graph_json.py.

(function graph2d() {
  const root = document.getElementById('graph2d');
  if (!root || !window.d3) return;
  const list = document.getElementById('graph-list');
  const count = document.getElementById('graph-count');
  const toggleAll = document.getElementById('graph-toggle');
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const short = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = window.matchMedia('(max-width: 700px)');

  // CIDOC CRM and Dublin Core properties in plain words
  const WORDS = {
    P108i_was_produced_by: 'produced by', P33: 'technique', P45: 'made of', P44: 'condition',
    P52: 'owned by', P55: 'kept at', P51: 'claimed by', P24i_changed_ownership_through: 'changed hands through',
    P25i_moved_by: 'moved by', P26: 'moved to', P27: 'moved from', P12i_was_present_at: 'present at',
    P14: 'carried out by', P17: 'motivated by', P131: 'located in', P23i_surrendered_title_through: 'gave up title through',
    P22i_acquired_title_through: 'acquired title through', P11i_participated_in: 'took part in', P10: 'part of the period',
    P39: 'measured', P61: 'found', P147i_was_curated_by: 'curated by', P3: 'note', P1566: 'GeoNames id',
    P2: 'type', P4: 'time-span', P7: 'took place at', P53: 'location', P62: 'depicts', P67: 'refers to',
    creator: 'made by', created: 'date', type: 'type', spatial: 'place', temporal: 'period', date: 'date',
    title: 'title', subject: 'subject', description: 'description', isPartOf: 'part of', sameAs: 'same as',
    altLabel: 'also called', officerInCharge: 'officer in charge', lat: 'latitude', long: 'longitude',
  };
  const word = (p) => WORDS[p] || p.replace(/^P\d+i?_/, '').replace(/_/g, ' ');

  const GROUPS = [
    { name: 'Made', props: ['creator', 'created', 'P108i_was_produced_by', 'P45', 'type'] },
    { name: 'Origin', props: ['spatial', 'P27', 'temporal'] },
    { name: 'Removal', props: ['P12i_was_present_at', 'P24i_changed_ownership_through', 'P25i_moved_by', 'P51', 'P26', 'P61'] },
    { name: 'Today', props: ['P52', 'P55', 'P44', 'isPartOf'] },
    { name: 'Described as', props: ['title', 'subject', 'description'] },
  ];
  const groupOf = (p) => GROUPS.findIndex((g) => g.props.includes(p));

  // one row per visible leaf; each column starts after the widest label of the one before
  const ROW = 30;
  const gap = () => (narrow.matches ? 22 : 44);
  const PAD = { top: 28, right: 32, bottom: 28, left: 16 };
  const sizes = () => (narrow.matches ? { rootW: 96, maxChars: 24, minChars: 16 } : { rootW: 200, maxChars: 44, minChars: 24 });
  // labels are cut to this many characters; render() lowers it until the graph fits its box
  let chars = 44;

  let byId = {};
  let out = {};
  let tree = null;
  let svg = null;
  let gLinks = null;
  let gNodes = null;
  let note = null;
  let view = { minX: 0, k: 1 };

  const name = (id) => byId[id]?.label || id;

  function buildTree(g) {
    const rootNode = g.nodes.find((n) => n.kind === 'root');
    const own = out[rootNode.id] || [];
    // statements pointing at the object (for example "found" by a ship's crew) are shown from its side
    const incoming = g.links.filter((l) => l.target === rootNode.id).map((l) => ({ source: rootNode.id, target: l.source, label: l.label }));
    const buckets = GROUPS.map(() => []);
    const other = [];
    [...own, ...incoming].forEach((l) => { const i = groupOf(l.label); (i < 0 ? other : buckets[i]).push(l); });
    const groups = GROUPS.map((gr, i) => ({ name: gr.name, links: buckets[i] })).concat([{ name: 'Other', links: other }]).filter((gr) => gr.links.length);

    function valueNode(l, depth, seen) {
      const n = byId[l.target];
      const kind = n ? (n.kind === 'root' ? 'resource' : n.kind) : 'literal';
      const next = new Set(seen).add(l.target);
      const kids = kind === 'literal' || depth > 3 ? [] : (out[l.target] || []).filter((k) => !seen.has(k.target));
      return {
        kind, prop: word(l.label), label: name(l.target), id: `${seen.size}:${l.label}:${l.target}`,
        children: kids.length ? kids.map((k) => valueNode(k, depth + 1, next)) : null,
      };
    }
    const seen = new Set([rootNode.id]);
    return {
      kind: 'root', label: rootNode.label, id: 'root',
      children: groups.map((gr) => ({ kind: 'group', label: gr.name, id: `g:${gr.name}`, children: gr.links.map((l) => valueNode(l, 2, seen)) })),
    };
  }

  // a link leaves its parent after the parent's label, so lines never run through text
  function linkPath(s, t) {
    const sx = s.y + (s.w || 0);
    const mx = sx + Math.max(18, (t.y - sx) / 2);
    return `M${sx},${s.x}C${mx},${s.x} ${mx},${t.x} ${t.y},${t.x}`;
  }

  function wrap(text, chars) {
    const lines = [''];
    text.split(/\s+/).forEach((wd) => {
      const cur = lines[lines.length - 1];
      if (cur && `${cur} ${wd}`.length > chars) lines.push(wd);
      else lines[lines.length - 1] = cur ? `${cur} ${wd}` : wd;
    });
    return lines.length > 3 ? [lines[0], lines[1], short(lines.slice(2).join(' '), chars)] : lines;
  }

  function drawNode(d) {
    // drawn afresh on every render, since the label length can change
    const g = d3.select(this);
    g.selectAll('*').remove();
    g.attr('tabindex', null).attr('role', null).attr('aria-haspopup', null).attr('aria-label', null);
    const k = d.data.kind;
    const { rootW } = sizes();
    const maxChars = chars;
    if (k === 'root') {
      const lines = wrap(d.data.label, narrow.matches ? 10 : 22);
      const h = 34 + lines.length * 19;
      g.append('rect').attr('class', 'g2-root-box').attr('x', 0).attr('y', -h / 2).attr('width', rootW).attr('height', h).attr('rx', 6);
      g.append('text').attr('class', 'g2-root-kind').attr('x', 14).attr('y', -h / 2 + 22).text('Object');
      const t = g.append('text').attr('class', 'g2-root-label').attr('y', -h / 2 + 44);
      lines.forEach((ln, i) => t.append('tspan').attr('x', 14).attr('dy', i ? 19 : 0).text(ln));
      d.w = rootW;
      return;
    }
    if (k === 'group') {
      g.append('rect').attr('class', 'g2-dot').attr('x', -4.5).attr('y', -4.5).attr('width', 9).attr('height', 9).attr('rx', 1.5);
      const t = g.append('text').attr('class', 'g2-group-label').attr('x', 14).attr('dy', '0.35em').text(d.data.label);
      d.w = 14 + t.node().getComputedTextLength() + 10;
      return;
    }
    const branches = (d._children || d.children || []).length;
    const long = d.data.label.length > maxChars;
    // on phones the property word is left out of the drawing; tapping a value shows it with the full text
    const tappable = long || narrow.matches;
    g.append('circle').attr('class', 'g2-dot').attr('r', k === 'literal' ? 3.5 : 5);
    if (branches) g.append('circle').attr('class', 'g2-ring').attr('r', 9);
    const text = g.append('text').attr('class', 'g2-label').attr('x', 16).attr('dy', '0.35em');
    if (!narrow.matches) text.append('tspan').attr('class', 'g2-prop').text(`${d.data.prop}  `);
    text.append('tspan').attr('class', 'g2-value').text(short(d.data.label, maxChars));
    if (branches) text.append('tspan').attr('class', 'g2-more').text(`  +${branches}`);
    else if (long) text.append('tspan').attr('class', 'g2-more').text('  read');
    d.w = 16 + text.node().getComputedTextLength() + 10;
    if (branches) {
      g.attr('tabindex', 0).attr('role', 'button')
        .attr('aria-label', `${d.data.prop} ${d.data.label}: ${branches} more statements`);
    } else if (tappable) {
      g.attr('tabindex', 0).attr('role', 'button').attr('aria-haspopup', 'dialog')
        .attr('aria-label', `${d.data.prop}: ${long ? 'read the full text' : d.data.label}`);
    }
  }

  function render(source) {
    const duration = reduce.matches ? 0 : 320;
    const ease = d3.easeCubicOut;
    closeNote();
    d3.tree().nodeSize([ROW, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 1.6))(tree);
    const nodes = tree.descendants();
    const from = source ? { x: source.x0 ?? source.x, y: source.y0 ?? source.y } : null;
    const src = source || tree;

    // nodes first: new labels are measured before the columns are placed
    const node = gNodes.selectAll('g.g2-node').data(nodes, (d) => d.data.id);
    const enter = node.enter().append('g')
      .attr('class', (d) => `g2-node g2-node--${d.data.kind}`)
      .style('opacity', 0);
    const merged = enter.merge(node);
    // fit the box: shorten the labels step by step; if that is not enough, the SVG scales down
    const avail = Math.max(280, root.clientWidth - 2);
    const { maxChars, minChars } = sizes();
    let cols;
    let maxRight;
    for (chars = maxChars; ; chars -= 4) {
      merged.each(drawNode);
      cols = [0];
      nodes.forEach((d) => { cols[d.depth + 1] = Math.max(cols[d.depth + 1] || 0, cols[d.depth] + d.w + gap()); });
      maxRight = d3.max(nodes, (d) => cols[d.depth] + d.w);
      if (maxRight + PAD.left + PAD.right <= avail || chars - 4 < minChars) break;
    }
    nodes.forEach((d) => { d.y = cols[d.depth]; });
    // new nodes grow out of the node that was opened; on first draw they fade in place
    enter.attr('transform', (d) => (from ? `translate(${from.y},${from.x})` : `translate(${d.y},${d.x})`));

    const pad = narrow.matches ? 34 : 40;
    const minX = d3.min(nodes, (d) => d.x) - pad;
    const maxX = d3.max(nodes, (d) => d.x) + pad;
    const width = Math.max(avail, maxRight + PAD.left + PAD.right);
    const height = maxX - minX + PAD.top + PAD.bottom;
    view = { minX: minX - PAD.top, k: avail / width };
    // first draw: take the size at once (a transition from no size starts at the browser's 300 x 150)
    (source ? svg.transition().duration(duration).ease(ease) : svg)
      .attr('width', width).attr('height', height)
      .attr('viewBox', `${-PAD.left} ${minX - PAD.top} ${width} ${height}`);

    merged.classed('is-open', (d) => !!d.children && d.depth >= 2)
      .attr('aria-expanded', (d) => (d.depth >= 2 && (d.children || d._children) ? String(!!d.children) : null));
    merged.transition().duration(duration).ease(ease)
      .attr('transform', (d) => `translate(${d.y},${d.x})`).style('opacity', 1);
    node.exit().transition().duration(duration * 0.6).ease(ease)
      .attr('transform', `translate(${src.y},${src.x})`).style('opacity', 0).remove();

    merged.on('click', (e, d) => activate(d))
      .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(d); } })
      .on('mouseenter focus', (e, d) => trace(d))
      .on('mouseleave blur', () => trace(null));

    const link = gLinks.selectAll('path').data(tree.links(), (d) => d.target.data.id);
    link.join(
      (en) => en.append('path').attr('class', 'g2-link')
        .attr('d', (d) => {
          const o = from ? { x: from.x, y: from.y, w: d.source.w } : d.source;
          return from ? linkPath(o, { x: o.x, y: o.y + o.w }) : linkPath(d.source, d.target);
        })
        .style('opacity', from ? 1 : 0)
        .call((e) => e.transition().duration(duration).ease(ease).style('opacity', 1).attr('d', (d) => linkPath(d.source, d.target))),
      (up) => up.call((u) => u.transition().duration(duration).ease(ease).attr('d', (d) => linkPath(d.source, d.target))),
      (ex) => ex.call((x) => x.transition().duration(duration * 0.6).ease(ease).style('opacity', 0).remove()),
    );

    nodes.forEach((d) => { d.x0 = d.x; d.y0 = d.y; });
    updateToggleLabel();
  }

  // light the path from a node back to the object
  function trace(d) {
    const path = new Set(d ? d.ancestors().map((a) => a.data.id) : []);
    gLinks.selectAll('path').classed('is-traced', (l) => path.has(l.target.data.id));
    gNodes.selectAll('g.g2-node').classed('is-traced', (n) => path.has(n.data.id));
    svg.classed('is-tracing', !!d);
  }

  function activate(d) {
    if (d.depth < 2) return;
    if (d.children) { d._children = d.children; d.children = null; render(d); }
    else if (d._children) { d.children = d._children; d._children = null; render(d); }
    else if (d.data.label.length > chars || narrow.matches) openNote(d);
  }

  // the note: the full text of a long value, pinned beside its node
  function openNote(d) {
    closeNote();
    const trigger = gNodes.selectAll('g.g2-node').filter((n) => n === d).node();
    note = document.createElement('div');
    note.className = 'g2-note';
    note.setAttribute('role', 'dialog');
    note.setAttribute('aria-label', d.data.prop);
    note.innerHTML = `<div class="g2-note__head"><p class="mono">${esc(d.data.prop)}</p><button type="button" class="btn btn--small">Close</button></div><p class="g2-note__text">${esc(d.data.label)}</p>`;
    root.appendChild(note);
    // under the node, kept inside the graph's width
    // svg units to box pixels (the graph may be scaled down to fit)
    const left = Math.min((d.y + PAD.left) * view.k + 12, root.clientWidth - note.offsetWidth - 12);
    note.style.left = `${Math.max(12, left)}px`;
    note.style.top = `${(d.x - view.minX) * view.k + 16}px`;
    note.querySelector('button').addEventListener('click', () => { closeNote(); trigger?.focus(); });
    note.querySelector('button').focus({ preventScroll: true });
  }
  function closeNote() { note?.remove(); note = null; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && note) closeNote(); });
  document.addEventListener('click', (e) => { if (note && !note.contains(e.target) && !e.target.closest?.('.g2-node')) closeNote(); });

  function openables() { return tree.descendants().filter((d) => d.depth >= 2); }
  function updateToggleLabel() {
    if (!toggleAll) return;
    toggleAll.textContent = tree.descendants().some((d) => d.depth >= 2 && d._children) ? 'Open all' : 'Close all';
  }
  toggleAll?.addEventListener('click', () => {
    const open = toggleAll.textContent === 'Open all';
    // open level by level so newly shown nodes open too
    if (open) { let more = true; while (more) { more = false; openables().forEach((d) => { if (d._children) { d.children = d._children; d._children = null; more = true; } }); } }
    else openables().forEach((d) => { if (d.children) { d._children = d.children; d.children = null; } });
    render(tree);
  });

  function renderList(g) {
    if (!list) return;
    list.innerHTML = g.links.map((l) => `<li><span>${esc(name(l.source))}</span> <span class="mono">${esc(word(l.label))}</span> <span>${esc(name(l.target))}</span></li>`).join('');
    if (count) count.textContent = g.links.length;
  }

  function draw() {
    root.innerHTML = '';
    svg = d3.select(root).append('svg').attr('class', 'g2-svg').attr('role', 'img')
      .attr('aria-label', 'Graph of the object\'s metadata. The same statements are listed as text below.');
    gLinks = svg.append('g').attr('class', 'g2-links');
    gNodes = svg.append('g').attr('class', 'g2-nodes');
    render(null);
  }

  let token = 0;
  async function show(no) {
    const t = ++token;
    root.classList.add('is-loading');
    try {
      const r = await fetch(`graphs/${String(no).padStart(2, '0')}.json`);
      if (!r.ok) throw new Error(r.status);
      const g = await r.json();
      if (t !== token) return;
      byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
      out = {};
      g.links.forEach((l) => { (out[l.source] = out[l.source] || []).push(l); });
      const link = document.getElementById('rdf-text-link');
      if (link && g.rdf) link.href = g.rdf.split('/').map(encodeURIComponent).join('/');
      tree = d3.hierarchy(buildTree(g), (d) => d.children);
      // values start closed: their own statements open on demand
      tree.descendants().forEach((d) => { if (d.depth >= 2 && d.children) { d._children = d.children; d.children = null; } });
      if (document.fonts?.ready) await document.fonts.ready; // labels are measured
      draw();
      renderList(g);
      root.classList.remove('is-error');
    } catch (err) {
      console.warn('graph could not be loaded', err);
      root.classList.add('is-error');
      root.innerHTML = '<p class="mono">The graph could not be loaded. The statements are listed below.</p>';
    } finally {
      if (t === token) root.classList.remove('is-loading');
    }
  }

  // phone and desktop layouts differ: redraw when crossing between them
  narrow.addEventListener?.('change', () => { if (tree) draw(); });

  window.Graph2D = { show };
})();
