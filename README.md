# Debrief

A playable rural horror game based on **Debrief**, the short story by **Ryan L. Melvin**.

Work three watchtower shifts. Shoot corn that tries to escape, distinguish human figures from moving crops, try to resist an intrusive urge to investigate, and choose what goes into the official debrief. After the sighting, roots gradually fill the stationary word “investigate” across the watchtower view. Holding your post until relief leads straight to the map with a brief notice that you could no longer resist; your later testimony remembers whether you chose to leave or were compelled. Inspect all three locations and return to the tower for debrief; your evidence changes your answers and available endings.

This is a first playable adaptation, with original additional scenes and seven alternate outcomes. The source manuscript has not been copied into the project. The application records and environmental anomalies are fictional story elements.

## Play locally

Requires Node.js 20 or newer. There are no packages to install and no build step.

```sh
npm start
```

Open **http://localhost:4317**. To use another port: `PORT=4321 npm start`.

If you fire on the recovery team, the final field view stays on screen with only “Shoot any that try to escape.” The outcome remains in Records.

The game lasts roughly 8–15 minutes, depending on reading and exploration. **Story** is the default intensity and uses the former Standard balance. **Hard** makes crops 40% faster, shortens spawn intervals by 25%, and raises walking exposure by about 30%. The former easy Story setting has been removed. Existing Story and Standard saves continue as the new Story mode with their progress intact.

| Action | Mouse or touch | Keyboard |
| --- | --- | --- |
| Fire | Click or tap a moving crop | X selects a crop; Space fires |
| Reload | Reload button | R |
| Travel | Tap a landmark, choose a route, then Walk | Tab between destinations; arrows/WASD for individual steps |
| Inspect | Opens automatically on arrival | E |
| Pause | Pause button | P or Escape |

People are not targets, whether they wear a white dress or recovery equipment. Six total perimeter breaches end the assignment. Leaving the tower early allows currently loose crops to escape. Investigations offer slower, lower-exposure paths or fast shortcuts through the rows. The map previews exposure before departure; walking can be stopped at any time. Each discovery opens on arrival, and the map suggests the next unread location. Inspect all three sites, then return to the tower before reaching 100 exposure. Debrief answers and retained exhibits affect the final disposition.

Walking between locations brings twelve illustrated encounters across three nights: buried radios, impossible tracks, abandoned lamps, and things that follow. The walk pauses for a choice. You can always move on without extra exposure; investigating can cost exposure, uncover an aid, or change an encounter on a later night. Your choices go into the notebook, mark the map, and can become testimony in the debrief. Mid-encounter saves preserve the choice and destination, including after an update.

## Publish on GitHub Pages

Everything the browser needs is in **`docs/`**. Assets use relative URLs, including the service worker and manifest, so project URLs such as `https://YOUR-USERNAME.github.io/debrief-corn-game/` work without changes.

1. Create or choose your GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Choose **Deploy from a branch**, then **main** and **/docs**, and save.
4. Open the published address once GitHub finishes deployment.

The `.nojekyll` file makes this a plain static deployment. No secrets, backend, paid service, account system, or build pipeline is needed. GitHub Pages setup follows the [official GitHub guide](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

Repository: https://github.com/ryanlmelvin/debrief-corn-game

Play online: https://ryanlmelvin.github.io/debrief-corn-game/

With sound enabled, the investigate pressure starts as a distant low drone. The pulse and close, beating tones build as the outdoor ambience recedes. The entire mix cuts to silence when the compulsion wins; ordinary ambience returns after the map notice closes. Pause, menus, and background tabs mute the sound; turning it back on resumes the current pressure level.

## Phone and desktop play

The game stays within the visible screen in portrait and landscape, including short phone screens with browser controls showing. Briefings, notebook entries, installation help, and records use readable pages with Back/Next controls instead of scrolling. Decision screens keep the situation, a concise notebook reminder, costs, and every response on one screen. Full interview wording remains in the saved transcript. Optional documents can be closed from their header; the notebook has a direct entry selector.

The field map keeps travel costs and Walk/Stop within reach. The recovery walk uses a compact thumb pad, a separate readable narrative line, and larger touch targets. Desktop retains mouse aiming, keyboard controls, and roomy illustrated documents. Arrow keys turn document pages; Tab navigates actions. The game pauses behind documents, the kit, and background tabs.

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
| `docs/field.js` / `docs/field-ui.js` | Route planning, exposure previews, responsive touch investigation map |
| `docs/encounters.js` | Between-location scenes, choices, consequences, and field notes |
| `docs/renderer.js` | Layered canvas landscape, illustrated actors, root motion and field survey |
| `docs/watch-story.js` | Nightly sightings, crop anatomy, and retrieval-team light timing |
| `docs/app.js` | Controls, paper documents, audio, saving, installation |
| `docs/style.css` / `docs/mobile.css` | Responsive interface, viewport layout, and touch controls |
| `docs/pager.js` / `docs/pager.css` | Measured, accessible document pages without scrolling |
| `docs/sw.js` | Versioned offline cache |
| `docs/manifest.webmanifest` | Installable app metadata |
| `DESIGN.md` | Adaptation choices and proposed next iteration |

The original landscape is drawn in code. Custom moving crop and retrieval-team sprites, field photographs, nine specimen studies, notebook and survey textures, and station props are bundled locally in `docs/assets/`. The private notebook has an exhibit index and pages; discovered evidence keeps its own study and location image. The map uses a worn survey sheet and drawn landmarks, and briefings and interviews use illustrated station equipment. Asset prompts are recorded in `ASSET-PROMPTS.md`; each of the twelve walking encounters has its own illustration, documented with its prompt in `ENCOUNTER-ART.md`. Fonts use the system’s installed serif and monospace families. No font service, CDN, analytics, or external network call is used during play.

## Inspiration

[Simon Willison’s HTML tools article](https://simonwillison.net/2025/Dec/10/html-tools/) informed the portable, client-only architecture and local persistence. [His Battle Drones writeup](https://simonwillison.net/2026/Oct/20/battledrones/) reinforces the value of iterating on actual play rather than treating a working prototype as a finished game.

The design combines the procedural pressure of *Papers, Please*, the accessible aiming of *Duck Hunt*, and the user-requested ecological unease associated with *Annihilation*. The prose and setting are an original adaptation of the user’s story.

## License and original story

Copyright (C) 2026 Ryan L. Melvin.

The game code, assets, and adaptation content distributed in this repository are licensed under the GNU General Public License, version 3 (GPL-3.0-only). See [LICENSE](LICENSE).

The original short story **Debrief** by Ryan L. Melvin is a separate work, is not included in this repository or the deployed site, and is not covered by this license. All rights to the original manuscript are reserved. The license grants no permission to publish or redistribute that manuscript.

Keep manuscript files outside this repository. Publish only the game adaptation; do not add the original story, excerpts supplied separately, or manuscript attachments.

If an older offline installation keeps showing outdated interviews, open [Update Debrief](https://ryanlmelvin.github.io/debrief-corn-game/update.html) and select **Load latest game**. This activates the published version without clearing saved progress.


The **Records** archive keeps discovered endings and the last 30 completed assignments, including interview answers, on this browser and device. Updating or starting a new assignment preserves the archive. Earlier runs completed before this feature cannot be reconstructed; a saved ending is added when resumed.

Every map landmark now has a different exhibit each night. Gold markers show unread locations; a check marks a completed inspection for that night. Choosing to lead the final recovery team opens a first-person field walk. Use W/S or Up/Down to walk, A/D or Left/Right to turn, and E to examine. The later rifle controls support pointer aiming, X to select a visible figure, and Space to fire; on-screen controls also support touch. The guide outcome reflects whether the player fires or lets the team leave.
