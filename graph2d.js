// Object page: the RDF metadata as a 2D diagram that reads left to right.
// The object sits on the left; its statements are sorted into a few plain groups
// (made, origin, removal, today, described as), each value drawn as a chip on a branch.
// A value that has statements of its own (a place, a museum, an event) opens to show
// them underneath. graphs/NN.json is made from the object's RDF file by
// tools/rdf_graph_json.py; the x/y/z positions in it are not used here.

(function graph2d() {
  const root = document.getElementById('graph2d');
  if (!root) return;
  const list = document.getElementById('graph-list');
  const count = document.getElementById('graph-count');
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const short = (t, n = 64) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

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

  // which group each of the object's own properties belongs to
  const GROUPS = [
    { name: 'Made', props: ['creator', 'created', 'P108i_was_produced_by', 'P45', 'type'] },
    { name: 'Origin', props: ['spatial', 'P27', 'temporal'] },
    { name: 'Removal', props: ['P12i_was_present_at', 'P24i_changed_ownership_through', 'P25i_moved_by', 'P51', 'P26', 'P61'] },
    { name: 'Today', props: ['P52', 'P55', 'P44', 'isPartOf'] },
    { name: 'Described as', props: ['title', 'subject', 'description'] },
  ];
  const groupOf = (p) => GROUPS.findIndex((g) => g.props.includes(p));

  let graph = null;
  let byId = {};
  let out = {};

  const name = (id) => byId[id]?.label || id;

  function chip(id, prop, depth, seen) {
    const n = byId[id];
    const kind = n ? n.kind : 'literal';
    const label = name(id);
    const children = kind === 'literal' || seen.has(id) ? [] : (out[id] || []).filter((l) => !seen.has(l.target) || byId[l.target]?.kind === 'literal');
    const text = `<span class="g2-chip__prop mono">${esc(word(prop))}</span><span class="g2-chip__label">${esc(short(label))}</span>`;
    const full = label.length > 64 ? ` title="${esc(label)}"` : '';
    if (!children.length || depth > 2) {
      return `<li><span class="g2-chip g2-chip--${kind}"${full}>${text}</span></li>`;
    }
    const next = new Set(seen).add(id);
    return `<li class="g2-branch"><button type="button" class="g2-chip g2-chip--${kind}" aria-expanded="false"${full}>${text}<span class="g2-chip__more mono">+${children.length}</span></button>
      <ul class="g2-children" hidden>${children.map((l) => chip(l.target, l.label, depth + 1, next)).join('')}</ul></li>`;
  }

  function build() {
    const rootNode = graph.nodes.find((n) => n.kind === 'root');
    const own = out[rootNode.id] || [];
    // statements pointing at the object (for example "found" by a ship's crew) are shown from its side
    const incoming = graph.links.filter((l) => l.target === rootNode.id).map((l) => ({ source: rootNode.id, target: l.source, label: l.label }));
    const buckets = GROUPS.map(() => []);
    const other = [];
    [...own, ...incoming].forEach((l) => { const g = groupOf(l.label); (g < 0 ? other : buckets[g]).push(l); });
    const groups = GROUPS.map((g, i) => ({ name: g.name, links: buckets[i] })).concat([{ name: 'Other', links: other }]).filter((g) => g.links.length);
    const seen = new Set([rootNode.id]);

    root.innerHTML = `
      <div class="g2-root"><span class="mono g2-root__kind">Object</span><strong>${esc(rootNode.label)}</strong></div>
      <ol class="g2-groups">${groups.map((g) => `
        <li class="g2-group">
          <h4 class="g2-group__name mono">${esc(g.name)}</h4>
          <ul class="g2-values">${g.links.map((l) => chip(l.target, l.label, 1, seen)).join('')}</ul>
        </li>`).join('')}
      </ol>`;

    root.querySelectorAll('.g2-branch > button').forEach((b) => b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      b.nextElementSibling.hidden = !open;
    }));
  }

  function renderList() {
    if (!list) return;
    list.innerHTML = graph.links.map((l) => `<li><span>${esc(name(l.source))}</span> <span class="mono">${esc(word(l.label))}</span> <span>${esc(name(l.target))}</span></li>`).join('');
    if (count) count.textContent = graph.links.length;
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
      graph = g;
      byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
      out = {};
      g.links.forEach((l) => { (out[l.source] = out[l.source] || []).push(l); });
      // link the RDF file on this site (the tour data may point to another repository)
      const link = document.getElementById('rdf-text-link');
      if (link && g.rdf) link.href = g.rdf.split('/').map(encodeURIComponent).join('/');
      build();
      renderList();
      root.classList.remove('is-error');
    } catch (err) {
      console.warn('graph could not be loaded', err);
      root.classList.add('is-error');
      root.innerHTML = '<p class="mono">The graph could not be loaded.</p>';
    } finally {
      if (t === token) root.classList.remove('is-loading');
    }
  }

  window.Graph2D = { show };
})();
