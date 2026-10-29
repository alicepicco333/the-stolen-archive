// Shows the generated content from llm-data.json on the object page: the
// "Go deeper" panel (history, geography), alt text for every photo and then/now geodata.
// llm-data.json is pre-generated (see the documentation, "Generated content"); it can also
// be rebuilt with llm/enrich.mjs. If it is missing, the page just works as before.

const LLM_UI = {
  en: { name: 'English', deeper: 'Go deeper', history: 'History', geography: 'Geography', then: 'Then', now: 'Now', removed: 'Removed' },
};

const LLMContent = {
  data: null,
  activeTab: 'history',

  async load() {
    try {
      const response = await fetch('llm-data.json');
      if (response.ok) this.data = await response.json();
    } catch (error) {
      console.info('No llm-data.json, AI content disabled.', error);
    }
    return this.data;
  },

  get lang() {
    return 'en'; // the site is in English only: the translations were removed
  },

  ui() {
    return LLM_UI[this.lang] || LLM_UI.en;
  },

  // Same id llm/enrich.mjs uses: the item's RDF file name, identical across tours.
  objectId(itemData) {
    const link = (itemData.metadata && itemData.metadata['Rdf-file_link']) || '';
    return decodeURIComponent(link.split('/').pop() || '').replace(/\.rdf$/i, '');
  },

  // The translations were removed: the tour texts are always the English originals.
  tourTranslation() {
    return null;
  },

  // Alt text and long description for one photo, in the current language.
  altFor(itemData, src) {
    const entry = this.data && this.data.objects && this.data.objects[this.objectId(itemData)];
    if (!entry) return null;
    const tr = (this.lang !== 'en' && entry.i18n && entry.i18n[this.lang] && entry.i18n[this.lang].alts) || {};
    return tr[src] || (entry.alts && entry.alts[src]) || null;
  },

  // Generated object content in the current language, falling back to English per field.
  objectContent(itemData) {
    const entry = this.data && this.data.objects && this.data.objects[this.objectId(itemData)];
    if (!entry) return null;
    const translated = (this.lang !== 'en' && entry.i18n && entry.i18n[this.lang]) || {};
    return {
      alt: translated.alt || entry.alt,
      deepdive: translated.deepdive || entry.deepdive,
      geo: entry.geo,
    };
  },

  render(itemData) {
    const content = this.objectContent(itemData);
    this.renderAlt(content);
    this.renderDeepdive(content);
    this.renderGeo(content);
  },

  renderAlt(content) {
    // the gallery (object-page.js) sets the alt text of each photo with altFor()
    const image = document.getElementById('tour-image');
    if (!image || !content || !content.alt || image.dataset.altSet) return;
    image.alt = content.alt.alt;
  },

  renderDeepdive(content) {
    const section = document.getElementById('deepdive');
    if (!section) return;
    const tabs = {
      history: content && content.deepdive && content.deepdive.history,
      geography: content && content.deepdive && content.deepdive.geography,
    };
    const available = Object.keys(tabs).filter((k) => tabs[k]);
    section.hidden = available.length === 0;
    if (section.hidden) return;

    const ui = this.ui();
    if (!available.includes(this.activeTab)) this.activeTab = available[0];
    section.querySelector('h2').textContent = ui.deeper;

    const tabBar = section.querySelector('.deepdive-tabs');
    tabBar.innerHTML = '';
    for (const key of available) {
      const button = document.createElement('button');
      button.className = 'tab';
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.textContent = ui[key];
      button.setAttribute('aria-selected', String(key === this.activeTab));
      button.addEventListener('click', () => {
        this.activeTab = key;
        this.renderDeepdive(content);
      });
      tabBar.appendChild(button);
    }

    const panel = section.querySelector('.deepdive-panel');
    panel.innerHTML = '';
    const add = (tag, text, parent = panel) => {
      const el = document.createElement(tag);
      el.textContent = text;
      parent.appendChild(el);
      return el;
    };

    const part = tabs[this.activeTab];
    add('h3', part.heading);
    part.paragraphs.forEach((text) => add('p', text));
  },

  renderGeo(content) {
    const details = document.getElementById('geo-details');
    if (!details) return;
    const geo = content && content.geo;
    details.hidden = !geo;
    if (!geo) return;
    const ui = this.ui();
    const coords = (lat, lng) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`;
    details.innerHTML = '';
    const lines = [
      `${ui.then}: ${geo.origin.place}, ${geo.origin.modern_country} (${coords(geo.origin.lat, geo.origin.lng)})`,
      `${ui.removed}: ${geo.removal.event}${geo.removal.actor ? ` (${geo.removal.actor})` : ''}`,
      `${ui.now}: ${geo.current.institution}${geo.current.city !== 'various' ? `, ${geo.current.city}, ${geo.current.country} (${coords(geo.current.lat, geo.current.lng)})` : ''}`,
    ];
    for (const line of lines) {
      const li = document.createElement('li');
      li.textContent = line;
      details.appendChild(li);
    }
  },
};

window.LLMContent = LLMContent;
