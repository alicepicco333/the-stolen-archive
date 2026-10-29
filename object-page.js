
// Function to parse URL parameters
function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        tour: params.get('tour'),
        no: params.get('no'),
        length: params.get('length'),
        complexity: params.get('complexity'),
    };
}


function getItemsFromLocalStorage() {
    const tourData = localStorage.getItem('tourData');
    if (!tourData) {
        return null;
    }
    return JSON.parse(tourData);
}

window.getItemsFromLocalStorage = getItemsFromLocalStorage;

// Museum map: only the object's own floor is shown (setupFloors in inventory.js)
const showMuseumFloor = setupFloors(document.getElementById('museum-map'));

// The object's room under the plan: its name, why its objects are together and the
// other objects in it; the room number is marked on the plan
function renderRoom(entry, floor) {
  const card = document.getElementById('room-card');
  const label = document.getElementById('museum-floor-label');
  if (label) label.textContent = `Floor ${floor}`;
  document.querySelectorAll('#museum-map [data-room]').forEach((el) => el.classList.toggle('is-current', entry && el.dataset.room === String(entry.room)));
  // every other object on this floor as a dot (only rooms are numbered on this plan);
  // those in the same room stand out, and each names its object on hover
  const markers = document.getElementById('floor-markers');
  if (markers) {
    markers.innerHTML = entry ? INVENTORY.filter((o) => o.floor === floor && o.no !== entry.no && o.pin).map((o) => `
      <a href="Object-page.html?no=${o.no}" data-no="${o.no}" class="${o.room === entry.room ? 'is-same-room' : ''}" aria-label="${invNo(o.no)} ${o.title}, ${roomLabel(o.room)}">
        <title>${invNo(o.no)} ${o.title}</title>
        <circle class="floor-dot" cx="${o.pin[0]}" cy="${o.pin[1] + 21}" r="9"/>
      </a>`).join('') : '';
  }
  if (!card) return;
  if (!entry) { card.innerHTML = ''; return; }
  const others = INVENTORY.filter((o) => o.room === entry.room && o.no !== entry.no);
  card.innerHTML = `
    <p class="room-card__no mono">Room ${entry.room}</p>
    <h4 class="room-card__name">${ROOMS[entry.room]}</h4>
    ${ROOM_NOTES[entry.room] ? `<p class="room-card__text">${ROOM_NOTES[entry.room]}</p>` : ''}
    ${others.length ? `<p class="room-card__also mono">Also in this room</p>
    <ul class="room-card__objects">${others.map((o) => `
      <li><a href="Object-page.html?no=${o.no}">
        <span class="room-card__thumb duotone"><img src="${o.images[0]}" alt="" loading="lazy"></span>
        <span class="mono">${invNo(o.no)}</span>
        <span class="room-card__title">${o.title}</span>
      </a></li>`).join('')}</ul>` : '<p class="room-card__also mono">The only object in this room</p>'}`;
  card.querySelectorAll('.room-card__objects a').forEach((a) => {
    const no = a.getAttribute('href').split('no=')[1];
    const mark = (on) => markers?.querySelector(`[data-no="${no}"]`)?.classList.toggle('is-active', on);
    ['mouseenter', 'focus'].forEach((ev) => a.addEventListener(ev, () => mark(true)));
    ['mouseleave', 'blur'].forEach((ev) => a.addEventListener(ev, () => mark(false)));
  });
}

async function loadTourContent() {
    const tourData = localStorage.getItem('tourData');
    if (!tourData) {
        return null;
    }
    const { tourName, length, complexity } = JSON.parse(tourData);
    if (!tourName || !length || !complexity) {
        document.getElementById('item-title').textContent = 'Invalid or Missing Selection';
        document.getElementById('item-text').textContent = 'Please return to the personalization page and make a selection.';
        return;
    }

    let data;
    try {
        const response = await fetch('tour-data.json');
        if (!response.ok) {
            throw new Error(`Failed to load tour data: ${response.status}`);
        }
        data = await response.json();
    } catch (error) {
        console.error('Error fetching tour data:', error);
        document.getElementById('item-title').textContent = 'Error Loading Data';
        document.getElementById('item-text').textContent = 'There was an error retrieving the tour data. Please try again later.';
        return;
    }

    try {

        if (!data[tourName]) {
            document.getElementById('item-title').textContent = 'Tour Not Found';
            document.getElementById('item-text').textContent = 'The selected tour is not available in our data.';
            return;
        }

        const tourDataObj = data[tourName];
        const items = tourDataObj.items || [];
        const texts = tourDataObj.texts || {};

        if (items.length === 0) {
            document.getElementById('item-title').textContent = 'No Items Found';
            document.getElementById('item-text').textContent = 'The selected tour does not have any items.';
            return;
        }

        let savedIndex = localStorage.getItem('currentIndex');
        let currentIndex = savedIndex !== null ? parseInt(savedIndex, 10) : 0;
        // Object-page.html?no=5 opens inventory number 5 (links from the home page and collection)
        const requestedNo = parseInt(getQueryParams().no, 10);
        if (requestedNo) {
            const found = items.findIndex((id) => objectNo(texts[id]) === requestedNo);
            if (found >= 0) {
                currentIndex = found;
                localStorage.setItem('currentIndex', currentIndex);
            }
        }
        document.getElementById('current-index').textContent = currentIndex;


        function displayItem(index, length, complexity) {
          const tourdataJson = localStorage.getItem('tourData');
          const tourdata = JSON.parse(tourdataJson);

          length = length || tourdata.length || 'short';
          complexity = complexity || tourdata.complexity || 'fun';

          const itemId = items[index];
          const itemData = texts[itemId];
          if (!itemData) {
              document.getElementById('item-title').textContent = 'Item Not Found';
              document.getElementById('item-text').textContent = 'The selected item could not be retrieved.';
              return;
          }

            // Translation from llm-data.json, if the visitor picked another language
            const translated = window.LLMContent?.tourTranslation(tourName, itemId, itemData);

            const [objectName, objectDate] = splitTitle(translated?.title || itemData.title || `Item ${index + 1}`);
            document.getElementById('item-title').textContent = objectName;
            document.getElementById('object-date').textContent = objectDate;
            const itemText = translated?.[complexity]?.[length] || itemData[complexity]?.[length] || 'No text available for this selection.';
            renderText(itemText);
            document.title = `${itemData.title} · The Stolen Archive`;

            renderLabel(itemData, index, items.length, tourName, length, complexity);

            const entry = inventoryEntry(objectNo(itemData));
            renderGallery(itemData, entry);

            // The museum map is an inline SVG: only the pin moves between items
            const museumPin = document.getElementById('museum-map-pin');
            const museumMapTitle = document.getElementById('museum-map-title');
            const pin = itemData.maps && itemData.maps['museum-pin'];
            // two floors: show the object's floor; the pin is hidden when the visitor
            // switches to the other one
            const floor = itemData.maps?.['museum-floor'] || entry?.floor || 1;
            showMuseumFloor(floor);
            if (museumPin) {
              museumPin.dataset.floor = floor;
              museumPin.toggleAttribute('hidden', !pin);
              if (pin) museumPin.setAttribute('transform', `translate(${pin.x} ${pin.y})`);
            }
            if (museumMapTitle) {
              museumMapTitle.textContent = `Museum map${itemData.maps && itemData.maps['caption-1'] ? ': ' + itemData.maps['caption-1'] : ''}`;
            }

            renderRoom(entry, floor);

            // The world map is an inline SVG too: pins, arc and zoom come from inventory.js
            renderGeoMap(document.getElementById('geo-map'), entry);
            const geoTitle = document.getElementById('geo-map-title');
            if (geoTitle) geoTitle.textContent = `World map: ${itemData.maps?.['caption-2'] || ''}`;

          const textGeoMap = document.getElementById('text-geo-map');
          textGeoMap.textContent = "";
          if (textGeoMap && itemData.maps && itemData.maps['caption-2']) {
            textGeoMap.textContent = translated?.['caption-2'] || itemData.maps['caption-2'];
          }

          // Alt text, "Go deeper" panel and then/now geodata from llm-data.json
          window.LLMContent?.render(itemData);

          // Two sides + how each tour tells this object (perspectives.js)
          window.Perspectives?.render(objectNo(itemData), data, { tourName, complexity });

            const rdfFileLinkElement = document.getElementById('rdf-text-link');
             if (rdfFileLinkElement && itemData.metadata && itemData.metadata['Rdf-file_link']) {
              rdfFileLinkElement.href = itemData.metadata['Rdf-file_link'];
          }

            // the metadata diagram (graph2d.js)
            window.Graph2D?.show(objectNo(itemData));

          const TableMetadata = document.getElementById('table-metadata');
            if (TableMetadata && itemData.metadata && itemData.metadata['Table']) {
                const tableURL = itemData.metadata['Table'];

                fetch(tableURL)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.text();
                    })
                    .then(data => {
                        TableMetadata.innerHTML = data;
                    })
                    .catch(error => console.error('Error loading table:', error));
            } else if (TableMetadata) {
                TableMetadata.innerHTML = '<p>No table information available.</p>';
            }
        }

        await Promise.all([window.LLMContent?.load(), window.Perspectives?.load()]);
        displayItem(currentIndex, length, complexity);

        document.getElementById('prev').addEventListener('click', () => {
            if (currentIndex > 0) {
                currentIndex--;
                localStorage.setItem('currentIndex', currentIndex);
                displayItem(currentIndex);
            }
        });

        document.getElementById('next').addEventListener('click', () => {
            if (currentIndex < items.length - 1) {
                currentIndex++;
                localStorage.setItem('currentIndex', currentIndex);
                displayItem(currentIndex);
            }
        });

        document.querySelectorAll('[data-length]').forEach((button) => {
            button.addEventListener('click', () => {
                const { length, complexity } = setReading({ length: button.dataset.length });
                displayItem(currentIndex, length, complexity);
            });
        });

        document.querySelectorAll('[data-complexity]').forEach((button) => {
            button.addEventListener('click', () => {
                const { length, complexity } = setReading({ complexity: button.dataset.complexity });
                displayItem(currentIndex, length, complexity);
            });
        });

        document.querySelectorAll('[data-tour]').forEach((button) => {
            button.addEventListener('click', () => changeTour(button.dataset.tour, 'short', 'fun'));
        });

        // numbered strip: one button per object in the tour
        const strip = document.getElementById('object-strip');
        if (strip) {
            items.forEach((itemId, i) => {
                const li = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = pad(objectNo(texts[itemId]) || i + 1, 3); // the collection number
                button.setAttribute('aria-label', `${pad(objectNo(texts[itemId]) || i + 1, 3)} ${texts[itemId]?.title || ''}`);
                button.addEventListener('click', () => {
                    currentIndex = i;
                    localStorage.setItem('currentIndex', currentIndex);
                    displayItem(currentIndex);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
                li.appendChild(button);
                strip.appendChild(li);
            });
            strip.children[currentIndex]?.querySelector('button').setAttribute('aria-current', 'true');
        }

    } catch (error) {
        console.error('Error loading tour data:', error);
        document.getElementById('item-title').textContent = 'Error Loading Data';
        document.getElementById('item-text').textContent = 'There was an error retrieving the tour data. Please try again later.';
    }
}

function changeTour(tourName, length, complexity) {
  localStorage.setItem('tourData', JSON.stringify({
      tourName: tourName,
      length: length,
      complexity: complexity
  }));
  localStorage.removeItem('currentIndex');
  location.reload();
}

// Saves a new length and/or complexity choice and returns the full selection
function setReading(change) {
  const tourdata = JSON.parse(localStorage.getItem('tourData'));
  Object.assign(tourdata, change);
  localStorage.setItem('tourData', JSON.stringify(tourdata));
  return { length: tourdata.length, complexity: tourdata.complexity };
}

const pad = (n, width = 2) => String(n).padStart(width, '0');

// Inventory number = the number the object's RDF file starts with (5_Europe_The_Parthenon...)
function objectNo(itemData) {
  const rdfName = decodeURIComponent((itemData.metadata?.['Rdf-file_link'] || '').split('/').pop());
  return parseInt(rdfName, 10) || null;
}

// Main photo + thumbnails: the tour's image first, then the object's other photos
// 3D scans (models/manifest.json), shown before the photos when an object has one
let models = null;
const modelsReady = fetch('models/manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((m) => { models = m; });
const viewerReady = new Promise((resolve) => {
  if (window.Viewer3D) resolve();
  else window.addEventListener('viewer3d-ready', resolve, { once: true });
});

async function renderGallery(itemData, entry) {
  const main = document.getElementById('tour-image');
  const thumbs = document.getElementById('gallery-thumbs');
  const count = document.getElementById('gallery-count');
  const viewer = document.getElementById('viewer3d');
  const photos = [itemData.image, ...((entry && entry.images) || []).filter((src) => src !== itemData.image)].filter(Boolean);
  const title = splitTitle(itemData.title || '')[0];
  await modelsReady;
  const model = entry && models && models[entry.no];
  const token = (renderGallery.token = (renderGallery.token || 0) + 1);
  // slides: the 3D scan first when there is one, then the photos
  const offset = model ? 1 : 0;
  const total = photos.length + offset;
  const enlarge = document.getElementById('gallery-enlarge');
  let current = 0;

  function mark(slide) {
    current = slide;
    thumbs.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === slide)));
  }

  function altFor(i) {
    const alt = window.LLMContent?.altFor(itemData, photos[i]);
    return alt ? alt.alt : `${title}, photo ${i + 1} of ${photos.length}`;
  }

  function show3d() {
    viewer.hidden = false;
    main.hidden = true;
    enlarge.hidden = true;
    count.textContent = `3D view, 1 of ${total}`;
    mark(0);
    renderCredit(model, true);
    viewerReady.then(() => { if (token === renderGallery.token) window.Viewer3D.show?.(model); });
  }

  function show(i) {
    if (viewer) viewer.hidden = true;
    main.hidden = false;
    enlarge.hidden = false;
    main.classList.remove('is-shown');
    main.src = photos[i];
    const alt = window.LLMContent?.altFor(itemData, photos[i]);
    main.alt = altFor(i);
    main.title = alt ? alt.long_description : '';
    main.dataset.altSet = alt ? '1' : '';
    main.decode?.().catch(() => {}).finally(() => main.classList.add('is-shown'));
    count.textContent = `Photo ${i + offset + 1} of ${total}`;
    renderCredit(photos[i]);
    mark(i + offset);
  }

  function step(direction) {
    const next = (current + direction + total) % total;
    if (model && next === 0) show3d();
    else show(next - offset);
  }

  // controls bound once per page; they always act on the gallery rendered last
  window.ObjectGallery = { photos, show, altFor, step, open: () => window.Lightbox?.open(current - offset) };
  if (!renderGallery.bound) {
    renderGallery.bound = true;
    document.querySelectorAll('[data-gallery-step]').forEach((b) => b.addEventListener('click', () => window.ObjectGallery.step(Number(b.dataset.galleryStep))));
    enlarge.addEventListener('click', () => window.ObjectGallery.open());
    main.addEventListener('click', () => window.ObjectGallery.open());
    // arrow keys step through the slides, except inside the 3D view where they rotate the model
    main.closest('figure').addEventListener('keydown', (e) => {
      if (e.target.closest('.viewer3d') || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      window.ObjectGallery.step(e.key === 'ArrowLeft' ? -1 : 1);
    });
  }

  thumbs.innerHTML = '';
  if (model) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb-3d';
    button.textContent = '3D';
    button.setAttribute('aria-label', 'Show the 3D model');
    button.addEventListener('click', show3d);
    li.appendChild(button);
    thumbs.appendChild(li);
  }
  photos.forEach((src, i) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Show photo ${i + 1} of ${photos.length}`);
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    button.appendChild(img);
    button.addEventListener('click', () => show(i));
    li.appendChild(button);
    thumbs.appendChild(li);
  });
  thumbs.hidden = total < 2;
  document.querySelectorAll('[data-gallery-step]').forEach((b) => { b.hidden = total < 2; });
  if (model && !window.Viewer3D?.unsupported) show3d();
  else show(0);
}

// Photo credits (author, licence, source) for the Wikimedia Commons photos, loaded once.
// Photos not listed (the project's original images) show no credit line.
let photoCredits = null;
const escHtml = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const creditsReady = fetch('images/credits.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((c) => { photoCredits = c; });

function renderCredit(src, is3d) {
  const el = document.getElementById('photo-credit');
  if (!el) return;
  const write = () => {
    const c = photoCredits && photoCredits[src];
    if (is3d) {
      // the 3D scan: what it shows, who made it, licence and source
      const m = src;
      el.hidden = false;
      const licence = m.license_url ? `<a href="${escHtml(m.license_url)}" target="_blank" rel="noopener">${escHtml(m.license)}</a>` : escHtml(m.license);
      el.innerHTML = `<em>${escHtml(m.shows)}${m.same_object ? '' : ' Not the object itself.'}</em>3D scan: ${escHtml(m.author)} · ${licence} · <a href="${escHtml(m.source)}" target="_blank" rel="noopener">source</a>`;
      const note = document.getElementById('viewer3d-note');
      if (note) note.innerHTML = m.same_object ? '<span>3D scan</span>' : '<span>3D scan</span> · a related piece, see below';
      return;
    }
    el.hidden = !c;
    if (!c) return;
    const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const licence = c.license_url ? `<a href="${esc(c.license_url)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : esc(c.license);
    el.innerHTML = `${c.note ? `<em>${esc(c.note)}</em>` : ''}Photo: ${esc(c.author)} · ${licence} · <a href="${esc(c.source)}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
  };
  if (photoCredits) write(); else creditsReady.then(write);
}

// "Parthenon Marbles – 447-438 BCE" -> ["Parthenon Marbles", "447-438 BCE"]
function splitTitle(title) {
  const m = title.trim().match(/^(.*?)\s+[–—-]\s+(.*\d.*)$/);
  return m ? [m[1], m[2]] : [title.trim(), ''];
}

// Museum label, stamp, big number, progress and control states for one item
function renderLabel(itemData, index, total, tourName, length, complexity) {
  const maps = itemData.maps || {};
  const inventoryNo = pad(objectNo(itemData) || index + 1, 3);
  // "Then: Athens (Greece) - Now: London, UK"
  const thenNow = (maps['caption-2'] || '').match(/Then:\s*(.*?)\s+-\s+Now:\s*(.*)/);
  // "Room 1 - Ancient Civilizations"
  const room = (maps['caption-1'] || '').match(/Room\s*(\d+)\s*-\s*(.*)/);

  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  // the inventory number: the object's only ID, the one number shown big
  const noEl = document.getElementById('object-no');
  if (noEl) noEl.textContent = inventoryNo;
  const entry = inventoryEntry(objectNo(itemData));
  set('label-from', entry ? entry.from.label : (thenNow ? thenNow[1] : '—'));
  set('label-to', thenNow ? thenNow[2] : '—');
  set('label-how', entry?.how ? entry.how.label : '—');
  // the room comes from inventory.js, the one source for room numbers (walking-route order)
  set('label-room', entry ? `${roomLabel(entry.room)} · ${ROOMS[entry.room]}` : (room ? `${roomLabel(room[1])} · ${room[2]}` : (maps['caption-1'] || '—')));
  // the museum's own wording, crossed out beside the field it belongs to (quirks.js)
  document.getElementById('status-wording')?.remove();
  if (entry && typeof Quirks !== 'undefined') {
    Quirks.loadWording().then(() => {
      [['label-how', 'how it left'], ['label-to', 'held today']].forEach(([id, field]) => {
        const dd = document.getElementById(id);
        const list = Quirks.wordingFor(entry.no, field);
        if (dd && list.length && !dd.querySelector('.museum-wording')) dd.insertAdjacentHTML('beforeend', ` ${Quirks.wordingHTML(list)}`);
      });
      const status = Quirks.wordingFor(entry.no, 'status/return');
      if (status.length && !document.getElementById('status-wording')) {
        document.querySelector('.object-label .label-list')?.insertAdjacentHTML('beforebegin', `<p class="object-label__wording" id="status-wording">${Quirks.wordingHTML(status)}</p>`);
      }
    });
  }
  set('tour-name', tourName.replace(/ Tour$/, ' tour'));
  // the tour position is a bar, not a number (screen readers get the stop in words)
  const bar = document.getElementById('tour-progress');
  if (bar) {
    bar.setAttribute('aria-valuemax', String(total));
    bar.setAttribute('aria-valuenow', String(index + 1));
    bar.setAttribute('aria-valuetext', `${tourName.replace(/ Tour$/, ' tour')}, stop ${index + 1} of ${total}`);
    bar.style.setProperty('--progress', String(total > 1 ? (index + 1) / total : 1));
  }

  document.getElementById('prev').disabled = index === 0;
  document.getElementById('next').disabled = index === total - 1;

  const press = (selector, attr, value) => document.querySelectorAll(selector).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));
  press('[data-tour]', 'tour', tourName);
  press('[data-length]', 'length', length);
  press('[data-complexity]', 'complexity', complexity);
  document.querySelectorAll('#object-strip button').forEach((b, i) => {
    if (i === index) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
}

window.onload = async () => {
  const tourData = localStorage.getItem('tourData');

  if (!tourData) {
      localStorage.setItem('tourData', JSON.stringify({
          tourName: 'Timeline Tour',
          length: 'short',
          complexity: 'fun'
      }));
  }

  // ?tour=Geo%20Tour (and optional length / complexity) overrides the saved choice
  const params = getQueryParams();
  if (params.tour) {
      const saved = JSON.parse(localStorage.getItem('tourData'));
      localStorage.setItem('tourData', JSON.stringify({
          tourName: params.tour,
          length: params.length || saved.length || 'short',
          complexity: params.complexity || saved.complexity || 'fun'
      }));
  }

  await loadTourContent();
};

// The tour text as real paragraphs. Texts with line breaks keep them; a long text written as
// one block is broken at sentence ends into paragraphs of about two to four sentences. The
// words are never changed: if the split would lose any text, the text stays one paragraph.
function textParagraphs(text) {
  const t = String(text || '').trim();
  let parts = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1 || t.length < 520) return parts;
  const sentences = t.match(/[^.!?]+[.!?]+["”’)]*(?:\s+|$)/g);
  if (!sentences || sentences.join('') !== t) return [t];
  parts = [];
  let cur = '';
  sentences.forEach((s) => {
    cur += s;
    const lastWord = cur.trim().split(/\s+/).pop() || '';
    // break after a sentence once the paragraph has some length, never after a short
    // abbreviation such as "St." or "c."
    if (cur.length > 330 && lastWord.replace(/[.!?"”’)]+$/, '').length > 3) { parts.push(cur.trim()); cur = ''; }
  });
  if (cur.trim()) {
    if (parts.length && cur.trim().length < 140) parts[parts.length - 1] += ` ${cur.trim()}`;
    else parts.push(cur.trim());
  }
  return parts;
}
function renderText(text) {
  const box = document.getElementById('item-text');
  if (!box) return;
  box.innerHTML = '';
  textParagraphs(text).forEach((para) => {
    const p = document.createElement('p');
    p.textContent = para;
    box.appendChild(p);
  });
}
