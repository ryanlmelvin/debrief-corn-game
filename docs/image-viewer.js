// A separate modal keeps the current encounter and notebook page intact.
const viewer = document.createElement('dialog');
viewer.id = 'image-viewer';
viewer.setAttribute('aria-label', 'Full screen image');
viewer.innerHTML = '<button type="button" aria-label="Close full screen image" autofocus>Close ×</button><div class="image-viewer-content"></div>';
document.body.append(viewer);
const content = viewer.querySelector('.image-viewer-content');
let returnFocus;
function close() { viewer.close(); }
viewer.querySelector('button').addEventListener('click', close);
viewer.addEventListener('click', event => { if (event.target === viewer || event.target === content) close(); });
viewer.addEventListener('keydown', event => event.stopPropagation());
viewer.addEventListener('cancel', event => { event.preventDefault(); close(); });
viewer.addEventListener('close', () => {
  content.replaceChildren();
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
});
function openImage(source) {
  returnFocus = source;
  const image = source.cloneNode(false);
  image.removeAttribute('id');
  image.removeAttribute('tabindex');
  image.removeAttribute('role');
  image.removeAttribute('title');
  image.removeAttribute('aria-label');
  image.className = source.matches('.specimen-drawing') ? 'image-viewer-specimen' : '';
  if (image.tagName === 'IMG') image.alt = source.alt;
  else { image.setAttribute('role', 'img'); image.setAttribute('aria-label', source.getAttribute('aria-label') || 'Field sketch'); }
  content.replaceChildren(image);
  viewer.showModal();
}
function prepareImages() {
  document.querySelectorAll('img, .specimen-drawing').forEach(source => {
    if (viewer.contains(source) || source.dataset.imageViewer) return;
    source.dataset.imageViewer = 'true';
    source.tabIndex = 0;
    source.setAttribute('role', 'button');
    source.setAttribute('aria-label', `View full screen: ${source.alt || source.getAttribute('aria-label') || 'image'}`);
    source.title = 'View full screen';
    source.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openImage(source); });
    source.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); openImage(source); }
    });
  });
}
prepareImages();
new MutationObserver(prepareImages).observe(document.body, { childList: true, subtree: true });
