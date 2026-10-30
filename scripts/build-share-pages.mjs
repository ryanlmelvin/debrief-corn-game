import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { ENDING_SHARES, GUIDE_TEAM_SHARE, SHARE_ROOT, endingShareCaption } from '../docs/sharing.js';

const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const description = 'Watch the corn. Follow procedure. Find your own ending in DEBRIEF, a short rural horror game.';
for (const card of [...Object.values(ENDING_SHARES), GUIDE_TEAM_SHARE]) {
  const url = `${SHARE_ROOT}share/${card.code}/`;
  const image = `${SHARE_ROOT}share/${card.code}/preview.jpg`;
  const caption = endingShareCaption(card);
  const title = escape(`${caption} — DEBRIEF`);
  // Static metadata is intentional: link-preview crawlers need no JavaScript.
  const html = `<!doctype html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#141d18">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DEBRIEF">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="800">
  <meta property="og:image:alt" content="${escape(card.alt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  <meta name="twitter:image:alt" content="${escape(card.alt)}">
  <link rel="icon" href="../../icons/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="../../icons/icon-192.png">
  <link rel="stylesheet" href="../../share.css">
</head>
<body>
  <main>
    <header><a class="wordmark" href="../../">DEBRIEF</a></header>
    <img src="./preview.jpg" width="1200" height="800" alt="${escape(card.alt)}">
    <div class="copy">
      <p class="eyebrow">AN ASSIGNMENT COMPLETED</p>
      <h1>${escape(caption)}</h1>
      <p class="description">Watch the corn. Follow procedure.<br>What will you put on the record?</p>
      <a class="play" href="../../">Find your own ending ↗</a>
      <p class="credit">A short rural horror game · Based on Debrief by Ryan L. Melvin</p>
    </div>
  </main>
</body>
</html>
`;
  const directory = new URL(`../docs/share/${card.code}/`, import.meta.url);
  if (process.argv.includes('--check')) {
    if (await readFile(new URL('index.html', directory), 'utf8') !== html) throw new Error(`Rebuild share page ${card.code}: npm run build:share`);
  } else {
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('index.html', directory), html);
  }
}
