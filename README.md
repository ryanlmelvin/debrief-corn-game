# Debrief

A playable rural horror game based on **Debrief**, the short story by **Ryan L. Melvin**.

Work three watchtower shifts. Shoot corn that tries to escape, distinguish human figures from moving crops, decide whether to leave your post, and choose what goes into the official debrief. Optional field investigations reveal evidence that changes your answers and available endings.

This is a first playable adaptation, with original additional scenes and six alternate outcomes. The source manuscript has not been copied into the project. The application records and environmental anomalies are fictional story elements.

## Play locally

Requires Node.js 20 or newer. There are no packages to install and no build step.

```sh
npm start
```

Open **http://localhost:4317**. To use another port: `PORT=4321 npm start`.

The game lasts roughly 5–10 minutes, depending on reading and exploration. **Story** intensity slows moving crops and reduces the exposure cost of walking.

| Action | Mouse or touch | Keyboard |
| --- | --- | --- |
| Fire | Click or tap a moving crop | X selects a crop; Space fires |
| Reload | Reload button | R |
| Walk | Direction buttons or a neighboring map tile | Arrow keys or WASD |
| Inspect | Inspect button or current tile | E |
| Pause | Pause button | P or Escape |

White figures are not targets. Six total perimeter breaches end the assignment. Leaving the tower early allows currently loose crops to escape. Investigations cost exposure with each step; return to the tower before reaching 100. Debrief answers and retained exhibits affect the final disposition.

## Publish on GitHub Pages

Everything the browser needs is in **`docs/`**. Assets use relative URLs, including the service worker and manifest, so project URLs such as `https://YOUR-USERNAME.github.io/debrief-corn-game/` work without changes.

1. Create or choose your GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Choose **Deploy from a branch**, then **main** and **/docs**, and save.
4. Open the published address once GitHub finishes deployment.

The `.nojekyll` file makes this a plain static deployment. No secrets, backend, paid service, account system, or build pipeline is needed. GitHub Pages setup follows the [official GitHub guide](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

Repository: https://github.com/ryanlmelvin/debrief-corn-game

Play online: https://ryanlmelvin.github.io/debrief-corn-game/

## Offline play and saves

The manifest and service worker make the game installable in compatible browsers and cache every game asset after an initial online load. The browser may offer **Install**, or **Add to Home Screen** through its own menu. On iOS, use Safari’s Share menu. Browser support determines the exact installation UI.

Progress is saved locally, including the current watch, investigation, and interview question. Saves stay on that browser and device; clearing website data removes them. The game handles blocked storage by showing a message and continuing in memory. The final transcript can be downloaded as a text file.

When changing any shipped asset, update `VERSION` in `docs/sw.js`. New versions wait for existing game tabs to close, avoiding mixed versions during an active shift. Caches and saves are scoped by project path so other GitHub Pages apps on the same origin are left alone. See [MDN’s service worker guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/CycleTracker/Service_workers).

## Development and checks

```sh
npm test
npm run check
```

The game-rule tests cover ammunition, shooting, civilian encounters, timing, containment failure, exploration, evidence, debrief branching, all ending conditions, a complete successful campaign, and invalid saved data. Browser checks should also cover a complete UI journey, narrow screens, keyboard navigation, offline reload, and subdirectory hosting. The local server also serves `/debrief-corn-game/` to exercise the GitHub Pages path.

| File | Purpose |
| --- | --- |
| `docs/engine.js` | Game rules, branching narrative, save validation |
| `docs/renderer.js` | Procedural canvas landscape, moving targets, field survey |
| `docs/app.js` | Controls, paper documents, audio, saving, installation |
| `docs/style.css` | Responsive interface and typography |
| `docs/sw.js` | Versioned offline cache |
| `docs/manifest.webmanifest` | Installable app metadata |
| `DESIGN.md` | Adaptation choices and proposed next iteration |

All visuals are drawn in code. Fonts use the system’s installed serif and monospace families. No font service, CDN, analytics, or external network call is used during play.

## Inspiration

[Simon Willison’s HTML tools article](https://simonwillison.net/2025/Dec/10/html-tools/) informed the portable, client-only architecture and local persistence. [His Battle Drones writeup](https://simonwillison.net/2026/Oct/20/battledrones/) reinforces the value of iterating on actual play rather than treating a working prototype as a finished game.

The design combines the procedural pressure of *Papers, Please*, the accessible aiming of *Duck Hunt*, and the user-requested ecological unease associated with *Annihilation*. The prose and setting are an original adaptation of the user’s story.

## License and original story

Copyright (C) 2026 Ryan L. Melvin.

The game code, assets, and adaptation content distributed in this repository are licensed under the GNU General Public License, version 3 (GPL-3.0-only). See [LICENSE](LICENSE).

The original short story **Debrief** by Ryan L. Melvin is a separate work, is not included in this repository or the deployed site, and is not covered by this license. All rights to the original manuscript are reserved. The license grants no permission to publish or redistribute that manuscript.

Keep manuscript files outside this repository. Publish only the game adaptation; do not add the original story, excerpts supplied separately, or manuscript attachments.
