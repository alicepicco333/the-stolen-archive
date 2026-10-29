// Full-screen photo viewer for the object page. Steps through the same photos as the
// gallery under the main image (object-page.js sets window.ObjectGallery), with
// previous/next, arrow keys, wheel zoom and drag. Closing it leaves the gallery on
// the photo that was last shown.

(function lightbox() {
  const box = document.getElementById('imageModal');
  const img = document.getElementById('expandedImg');
  const count = document.getElementById('lightbox-count');
  const closeButton = document.getElementById('lightbox-close');
  const steps = box.querySelectorAll('[data-lightbox-step]');
  let index = 0;
  let scale = 1;
  let x = 0;
  let y = 0;
  let drag = null;
  let returnFocus = null;

  const photos = () => (window.ObjectGallery ? window.ObjectGallery.photos : []);
  const pad = (n) => String(n).padStart(2, '0');

  function applyTransform() {
    img.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`;
  }

  function show(i) {
    const list = photos();
    if (!list.length) return;
    index = (i + list.length) % list.length;
    img.src = list[index];
    img.alt = window.ObjectGallery.altFor(index);
    scale = 1; x = 0; y = 0;
    applyTransform();
    count.textContent = `Photo ${index + 1} of ${list.length}`;
    steps.forEach((b) => { b.hidden = list.length < 2; });
  }

  function open(i) {
    returnFocus = document.activeElement;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    show(i);
    closeButton.focus();
  }

  function close() {
    box.hidden = true;
    document.body.style.overflow = '';
    window.ObjectGallery?.show(index);
    returnFocus?.focus?.();
  }

  steps.forEach((b) => b.addEventListener('click', () => show(index + Number(b.dataset.lightboxStep))));
  closeButton.addEventListener('click', close);
  // a click on the dark background, outside the photo and the controls, also closes
  box.addEventListener('click', (e) => { if (e.target === box || e.target.classList.contains('lightbox__stage')) close(); });

  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
  });

  // zoom with the wheel, drag to move a zoomed photo
  img.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale = Math.min(10, Math.max(1, scale - e.deltaY * 0.001));
    if (scale === 1) { x = 0; y = 0; }
    applyTransform();
  }, { passive: false });
  img.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    drag = { x: e.clientX - x, y: e.clientY - y, startX: e.clientX };
    img.setPointerCapture(e.pointerId);
  });
  img.addEventListener('pointermove', (e) => {
    if (!drag || scale === 1) return;
    x = e.clientX - drag.x;
    y = e.clientY - drag.y;
    applyTransform();
  });
  img.addEventListener('pointerup', (e) => {
    // a horizontal swipe on an unzoomed photo goes to the next or previous one
    if (drag && scale === 1 && Math.abs(e.clientX - drag.startX) > 50) show(index + (e.clientX < drag.startX ? 1 : -1));
    drag = null;
  });
  img.addEventListener('pointercancel', () => { drag = null; });

  window.Lightbox = { open };
})();
