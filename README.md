# Debrief

A playable rural horror game based on **Debrief**, the short story by **Ryan L. Melvin**.

Work three watchtower shifts. Shoot corn that tries to escape, distinguish human figures from moving crops, try to resist an intrusive urge to investigate, and choose what goes into the official debrief. After the sighting, roots gradually fill the stationary word “investigate” across the watchtower view. Holding your post until relief leads straight to the map with a brief notice that you could no longer resist; your later testimony remembers whether you chose to leave or were compelled. Inspect all three locations and return to the tower for debrief; your evidence changes your answers and available endings.

This is a first playable adaptation, with original additional scenes and twenty-four endings. The source manuscript has not been copied into the project. The application records and environmental anomalies are fictional story elements.

## Play locally

Requires Node.js 20 or newer. There are no packages to install and no build step.

```sh
npm start
```

Open **http://localhost:4317**. To use another port: `PORT=4321 npm start`.

**Mini games:** Open **Menu → Mini games** to see Watchtower, Corn Escape, Radio Tuning, Pump Puzzle, Dungeon Crawler Corn, Roots & Recordings, and The Other Tower. Each stays locked until you start playing it in the story; winning is not required. Unlocks persist across runs and move with saved progress. Once unlocked, practice sessions save separately, survive reloads, and leave your story assignment, ending collection, transcripts, and watch records untouched. Use **Return to story** to continue your assignment. Endings are awarded only when reached through normal story play.

**Local playtest: Dungeon Crawler Corn.** Open **http://localhost:4317/?preview=dungeon** to jump straight to the new drainage-channel route. This localhost-only shortcut has its own save and ending collection; reload to resume or choose Menu → Restart dungeon to try again. To discover it normally, inspect the drainage channel, then choose **Follow the drain below ground** on the map or in **Break protocol**.

Explore three turn-based dungeon floors as the human guard, carrying your rifle and ammunition from the watch. Find each brass key and the stairs, shoot roots in clear sight or strike with your rifle butt by moving into them, and dodge their marked next strike. Arrows/WASD move, **F** or **Space** fires at the marked root, **R** reloads, and **period** waits a turn; touch controls are also available. Medical supplies restore health and ammunition boxes replenish your reserve. Escaping leads to a three-question debrief with the supervisor before the ending; your answers shape the interview and final account. Being lost below the root line has its own ending. Practice includes the debrief without awarding an ending. Progress saves after every action and answer.

The recovery detail ends with a recorded interview. If any of its six rounds remain, either interview question lets you grab the rifle and try to shoot the interviewer. The attempt spends one round and cuts to its own interrupted-tape ending; it never establishes who was hit or who survives. This outcome has its own Endings entry and spoiler-free share card.

The game lasts roughly 8–15 minutes, depending on reading and exploration. **Story** is the default intensity and uses the former Standard balance. **Hard** makes crops 40% faster, shortens spawn intervals by 25%, and raises walking exposure by about 30%. The former easy Story setting has been removed. Existing Story and Standard saves continue as the new Story mode with their progress intact.

New watches open with ordinary stalkers, fast runners, and two-hit husks, then build into seeded runner packs, husk escorts, and attacks toward both fences. A three-crop last stand arrives at 41 seconds. Hard adds extra crops to two packs. Each watch starts with two flares that slow every crop for 4.5 seconds, including crops that emerge during the burn. Press **F** or tap **Flare** when you need time to reload or contain a rush. Reload normally with **R**; optionally press again while the timing marker is in the gold band to finish early. A mistimed press still completes the normal reload.

Want more danger? Press **B** or tap **Ring bell** to call three marked crops into the field. Contain all three in ten seconds for **600 bonus points, six reserve rounds, and a replacement flare**. The bell button shows the remaining crops and time during a rush. The husk takes two hits. A marked crop escaping or the timer expiring loses the bonus; surviving crops still need to be contained. You can ring twice per watch, until 39 seconds, with at least four rounds available. The bell is optional and does not alter story requirements. Saves from an earlier release finish their current watch on its original spawn schedule; their next watch uses the new waves. In-progress bell challenges survive saves and progress transfer without repeating rewards.

Clean containments build a streak and bonus points. Every five consecutive containments earns a replacement flare, with a carry limit of two. A miss or breach resets the streak. Bell and streak rewards encourage spending flares to contain the next rush. Crops collapse into their rows when hit, husks recoil as their shell breaks, and brief equipment sounds acknowledge rewards. Reduced-motion mode keeps the clear hit marks without the falling/debris animations. Crop markers identify runners and remaining husk health, and fence warnings show imminent escapes. Open **Watch record** in the kit, or the score button on the investigation map, to see accuracy, best streak, containment grade, and the best score for that night and intensity on this browser. The record also tracks bell rushes cleared and replacement flares earned. Scores do not change the story endings. Best-score records are separate from transferable story progress.

| Action | Mouse or touch | Keyboard |
| --- | --- | --- |
| Fire | Click or tap a moving crop | X selects a crop; Space fires |
| Reload | Reload button | R |
| Emergency flare | Flare button | F |
| Optional bonus rush | Ring bell button | B |
| Travel | Tap a landmark, choose a route, then Walk | Tab between destinations; arrows/WASD for individual steps |
| Inspect | Opens automatically on arrival | E |
| Pause | Pause button | P or Escape |

People are not targets, whether they wear a white dress or recovery equipment. Six total perimeter breaches end the assignment. Leaving the tower early allows currently loose crops to escape. Investigations offer slower, lower-exposure paths or fast shortcuts through the rows. The map previews exposure before departure; walking can be stopped at any time. Each discovery opens on arrival, and the map suggests the next unread location. Inspect all three sites, then return to the tower before reaching 100 exposure. Debrief answers and retained exhibits affect the final disposition. The final refusal shows green and red requirements based on the assignment’s discoveries and choices. No ending checklist or evidence-preparation tasks appear earlier in play.

Want to go off the rails? **Break protocol** on the field map offers three departures from the assignment. At 70 exposure, **Stop resisting** lets you embrace the change; reaching 100 exposure triggers it automatically. You become the corn: dodge bullet patterns through two field crossings, then cross the road between passing cars. Cover breaks up each crossing. Reach the far verge and choose whether to escape alone or go back to open the gate. Older in-progress transformations keep their original bullet-only crossings. **Broadcast on every frequency** lets you seize three carrier bands with a timed radio control, then choose what your voice becomes. At the inspected pump house, **Reverse the treatment pumps** opens a rotating-pipe puzzle: connect the inlet to the outlet and release the flow. These routes add seven endings. Being shot and being hit by traffic each unlock a separate ending from escaping or opening the gate. The radio and pump introductions let you back out before committing; transformation at full exposure is permanent. Progress within each sequence survives saving, updating, and transfer.

Walking between locations brings twelve illustrated encounters across three nights. New games vary their timing and select from three versions of each recurring scene, with matching existing illustrations. Later incidents also respond to your choices: once an ending is out of reach, an encounter reserved for it can give way to an unrelated event. Ten replacement scenes cover abandoned equipment, strange water, survey marks, and other disturbances. Any encounter still needed by a possible ending stays available. The walk pauses for a choice. You can always move on without extra exposure; investigating can cost exposure, uncover an aid, or change an encounter on a later night. Your choices go into the notebook, mark the map, and can become testimony in the debrief. Mid-encounter saves preserve the chosen scene, response, and destination, including after an update or progress transfer. The notebook and debrief remember the version you actually saw. Games started before this change keep their original encounters; start a new game for the new variety.

Each new game schedules the cooking smell on exactly one of the three nights. Inspecting the pump house that night offers the meal; the other two nights draw different optional scenes from a pool of six, each with its own custom illustration. There are 90 possible three-night arrangements, and an atmospheric scene cannot repeat within one game. Ignoring the smell does not cause it to return on a later night. You can revisit that night’s scene from the map or with **E** while at the inspected pump house. The saved schedule survives updates and progress transfers. Older saves keep a currently offered meal and avoid repeating an earlier offer.

The first discovery card at each landmark also varies across new games. Each of the nine exhibits has its original discovery and two alternatives, with nine custom illustrations for the new scenes. The underlying exhibit and its discovery night remain available for the same ending requirements. The notebook, debrief, and exported transcript retain the version actually discovered. Existing saves keep their original discoveries; start a new game to see the alternatives. While a discovery card is open, the map stays on that location and suggests the next destination only after the card closes.

At the last debrief, **I need to do something first** opens five more ways out: hand your post to your double, bring a witness, rescue the person at the lantern, accept a promotion, or return to the second tower. Earlier encounters and reports unlock them. Each route has three scenes, a choice to leave before committing, its own illustration, and a share card. The replacement can hear the truth about relief. Rescue now opens Roots & Recordings: line up the recorded breath with the live radio, then hold to pull during quiet windows and release between grips. Visual traces and root cues make sound optional; mistakes are retryable. Free both boots, then choose whether to leave the recordings and carry the person out. You can withdraw before committing, and all earned progress saves. Reaching the activity unlocks its separate practice session; older completed endings stay completed. Transmission now opens The Other Tower: guide your earlier light across three moving rows using Wait, Advance, and Turn. Every command takes 1.2 seconds to arrive; a missed opening returns you to the last safe marker. The displayed memory follows the first radio choice from your actual run, and the final broadcast stays an explicit choice after the crossings. Reaching it unlocks separate practice. Every scene and both activities save automatically; pause, menus, updates, and background tabs stop their clocks.

## Publish on GitHub Pages

Everything the browser needs is in **`docs/`**. Assets use relative URLs, including the service worker and manifest, so project URLs such as `https://YOUR-USERNAME.github.io/debrief-corn-game/` work without changes.

1. Create or choose your GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Choose **Deploy from a branch**, then **main** and **/docs**, and save.
4. Open the published address once GitHub finishes deployment.

The `.nojekyll` file makes this a plain static deployment. No secrets, backend, paid service, account system, or build pipeline is needed. GitHub Pages setup follows the [official GitHub guide](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

Repository: https://github.com/ryanlmelvin/debrief-corn-game

Play online: https://ryanlmelvin.github.io/debrief-corn-game/

With sound enabled, the investigate pressure starts as a distant low drone. The pulse and close, beating tones build as the outdoor ambience recedes. The entire mix cuts to silence when the compulsion wins; ordinary ambience returns after the map notice closes. Quiet crickets establish the outdoor ambience and recede with pressure. Successful walking adds soft footsteps and occasional leaves; radio encounters use brief static, and the extra-step encounter adds one delayed footstep after you stop. Story encounters keep their soundscape, while pause, menus, other documents, and background tabs mute the sound. All effects, including delayed cues, cut off during compulsion. Resuming a save or unmuting never replays an old encounter cue. The four CC0 effects add about 187 KB and are cached with the game for offline playback; credits and source details are in `docs/assets/SOUND-LICENSE.txt`. The sound mix uses gentle compression ahead of the final silence gate, keeps the pressure drone near the ambience level, and softens gunshots and the sound-on tone. Rapid shots have limited overlap so repeated clicks cannot build a loud burst. The source recordings are unchanged.

## Phone and desktop play

The game stays within the visible screen in portrait and landscape, including short phone screens with browser controls showing. Briefings, notebook entries, installation help, and records use readable pages with Back/Next controls instead of scrolling. Decision screens keep the situation, a concise notebook reminder, costs, and every response on one screen. Full interview wording remains in the saved transcript. Optional documents can be closed from their header; the notebook has a direct entry selector.

The field map keeps travel costs and Walk/Stop within reach. The recovery walk uses a compact thumb pad, a separate readable narrative line, and larger touch targets. Desktop retains mouse aiming, keyboard controls, and roomy illustrated documents. Arrow keys turn document pages; Tab navigates actions. The game pauses behind documents, the kit, and background tabs.

## Offline play and saves

The manifest and service worker make the game installable in compatible browsers and cache every game asset after an initial online load. The browser may offer **Install**, or **Add to Home Screen** through its own menu. On iOS, use Safari’s Share menu. Browser support determines the exact installation UI.

Progress is saved locally, including the current watch, investigation, and interview question. Saves stay on that browser and device; clearing website data removes them. The game handles blocked storage by showing a message and continuing in memory. The final transcript can be downloaded as a text file.

**Installing from Safari:** iOS/iPadOS 17.2+ and Safari’s Add to Dock copy cookies into a newly installed app, but not local storage. Debrief prepares a compressed snapshot of the current shift and complete Endings collection in short-lived, project-scoped cookies. An empty installed app restores that snapshot once; existing app progress always takes precedence. Browser and app progress are independent after installation. The cookie snapshot is capped at 6,000 characters to avoid oversized request headers; if a full archive cannot fit or cookies are blocked, the installation guide directs the player to manual transfer without dropping records.

**Recover progress in an existing installation:** update both Safari and the app, then choose **Menu → Move saved progress** in Safari and **Copy progress** (or **Save backup**). Open the same menu in the installed app, paste the code (or **Open backup**), and confirm **Restore progress**. This carries the shift, collected endings, and transcripts. Restore combines ending collections and retains the latest 30 assignments, with a confirmation before replacing the current shift. Backup files also work across devices. Keep the browser copy until the transfer is complete.

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
| `docs/encounters.js` | Encounter timing, selection, choices, consequences, and saved field notes |
| `docs/encounter-flavors.js` / `docs/encounter-detours.js` | Authored scene variants and replacements for closed leads |
| `docs/site-encounters.js` / `docs/story-random.js` | Per-game landmark scene schedules and independent story randomness |
| `docs/evidence-scenes.js` / `docs/evidence-flavors.js` | Canonical exhibit schedule, saved discovery selection, and authored discovery variants |
| `docs/ending-paths.js` | Shared ending prerequisites, availability, and protection of still-possible leads |
| `docs/alternate-endings.js` / `docs/resolution-ui.js` | Five final-night routes, choices, requirements, and saved scenes |
| `docs/rogue.js` / `docs/rogue-ui.js` / `docs/rogue-endings.js` | Reckless field routes, bullet and traffic crossings, radio takeover, pump puzzle, and seven outcomes |
| `docs/renderer.js` | Layered canvas landscape, illustrated actors, root motion and field survey |
| `docs/watch-story.js` | Nightly sightings, crop anatomy, and retrieval-team light timing |
| `docs/app.js` | Controls, paper documents, audio, saving, installation |
| `docs/progress.js` | Validated save transfers and Safari installation handoff |
| `docs/style.css` / `docs/mobile.css` | Responsive interface, viewport layout, and touch controls |
| `docs/pager.js` / `docs/pager.css` | Measured, accessible document pages without scrolling |
| `docs/sw.js` | Versioned offline cache |
| `docs/manifest.webmanifest` | Installable app metadata |
| `DESIGN.md` | Adaptation choices and proposed next iteration |

## How to contribute

Read `AGENTS.md` before making changes, and run both `npm test` and `npm run check` before publishing. Keep the original short-story manuscript out of the repository and deployment. Preserve the existing background art and color scheme unless a change is requested. For shipped game assets, bump the cache version in `docs/sw.js` and preserve the progress-saving “Update ready. Download?” flow.

### Ending reachability and protection

Every ending must be reachable from a new game. Each fresh assignment must offer a valid path to every ending before the player makes choices; random schedules, scene variants, and replacement encounters must not silently remove those opportunities. Paths can close as a consequence of the player's choices, so a single playthrough does not need to keep every ending available forever. Prove new or changed paths with tests that play through the real game transitions from a fresh state.

The ending protection system keeps encounters and their prerequisite opportunities available while an ending still needs them. Declare those dependencies in the shared rules described below, and test that new content preserves still-possible paths while allowing replacements after a path closes.

### “You've already seen all these endings” hints

This note tells a player that a choice has no new ending paths to offer: every ending reachable after that choice is already in their collection. It covers all continuations, including later withdrawals, alternate actions, ammunition-dependent outcomes, and timed inputs. Protection of an encounter or a route's name is not proof of which endings a choice can reach.

Review `docs/seen-endings.js` whenever changing an ending, action, prerequisite, withdrawal, or timing-dependent outcome. Preview the real transitions without changing saves, transcripts, history, or randomness. If any continuation is uncertain, suppress the hint or retain a conservative superset of endings. Regression tests in `tests/seen-endings.test.mjs` must show that omitting each reachable ending suppresses the hint and collecting every proven possibility enables it; cover locked and unsupported choices, backtracking, guide outcome identities and ammunition, and timed inputs where affected.

### Adding endings and encounter variety

Ending changes also require a safety review of choice hints. `npm run check` compares the live ending registry with the explicit audit in `scripts/check-ending-hints.mjs` and fails on an unreviewed addition, removal, or rename. Update the audit rationale and `tests/seen-endings.test.mjs` together: removing any reachable ending from the collection must suppress the note, including paths through withdrawals and loaded-rifle interviews. Keep timed controls conservative and preserve the original game state during previews. The complete maintenance rules are in `AGENTS.md`.

Declare each ending’s prerequisites in `docs/ending-paths.js`. `endingPathRequirements` drives the final requirement display and gates; `neededEncounterIds` uses the same declarations to protect unfinished leads. The supported rules describe encounter answers, evidence with a discovery night, and report choices with their available questions and shifts. Item dependencies are discovered from canonical encounter choices’ `requires` and `flag` fields, so a new ending that needs a later tape comparison also protects its earlier recording opportunity automatically.

Landmark scene guarantees are declared separately in `SITE_POOLS` in `docs/site-encounters.js`: each site specifies its number of nights, required scenes, and alternatives. The selector fills and shuffles the schedule once; validation checks the same registry. `currentSiteScene` drives the evidence prompt, map button, keyboard action, and meal eligibility together.

Primary discoveries use `EVIDENCE_SCHEDULE` and `EVIDENCE` in `docs/evidence-scenes.js` for their stable location, night, identity, and facts. Append presentations to that exhibit’s pool in `docs/evidence-flavors.js`; each supplies a title, prose, and art key. Selection and validation derive their limits from these pools, and `evidenceForState` supplies the same saved presentation to every reading surface. Keep existing pool indexes stable. Discovery flavor cannot change the exhibit ID or its ending credit.

An unmet requirement remains possible until its opportunity has passed or a conflicting answer has been made. The director selects replacement content only when no possible ending still needs that encounter. Add replacement pools in `docs/encounter-detours.js`; these scenes keep their scheduling slot, but their distinct response IDs cannot earn the original lead’s ending credit. Calming replacements preserve the slot’s best exposure reduction. Add cosmetic versions in `docs/encounter-flavors.js` without changing canonical choice mechanics.

A new game saves its presentation and timing plan independently of the watch’s random generator. Replacement selection is committed on arrival and never reconsidered when rendering the choice, result, notebook, or debrief. Keep shipped encounter IDs, response IDs, and variant/pool indexes stable; append content instead of reordering it. The selector and save validator derive their limits from the authored pools. Existing games without the director keep their original scenes. The tests cover a synthetic future ending with recursively discovered item prerequisites, real campaigns, branch-dependent replacements, offline assets, save migration, and progress transfer.

The original landscape is drawn in code. Custom moving crop and retrieval-team sprites, field photographs, nine specimen studies, notebook and survey textures, and station props are bundled locally in `docs/assets/`. The private notebook has an exhibit index and pages; discovered evidence keeps its own study and location image. The map uses a worn survey sheet and drawn landmarks, and briefings and interviews use illustrated station equipment. Asset prompts are recorded in `ASSET-PROMPTS.md`; each of the twelve walking encounters has its own illustration, documented with its prompt in `ENCOUNTER-ART.md`. Fonts use the system’s installed serif and monospace families. No font service, CDN, analytics, or external network call is used during play.

The five additional ending illustrations and their social previews are documented in `ENDING-ART.md`.

The nine primary-discovery illustrations and their exact generation prompts are documented in `DISCOVERY-ART.md`.

## Inspiration

[Simon Willison’s HTML tools article](https://simonwillison.net/2025/Dec/10/html-tools/) informed the portable, client-only architecture and local persistence. [His Battle Drones writeup](https://simonwillison.net/2026/Oct/20/battledrones/) reinforces the value of iterating on actual play rather than treating a working prototype as a finished game.

The design combines the procedural pressure of *Papers, Please*, the accessible aiming of *Duck Hunt*, and the user-requested ecological unease associated with *Annihilation*. The prose and setting are an original adaptation of the user’s story.

## License and original story

Copyright (C) 2026 Ryan L. Melvin.

The game code, assets, and adaptation content distributed in this repository are licensed under the GNU General Public License, version 3 (GPL-3.0-only). See [LICENSE](LICENSE).

The original short story **Debrief** by Ryan L. Melvin is a separate work, is not included in this repository or the deployed site, and is not covered by this license. All rights to the original manuscript are reserved. The license grants no permission to publish or redistribute that manuscript.

Keep manuscript files outside this repository. Publish only the game adaptation; do not add the original story, excerpts supplied separately, or manuscript attachments.

If an older offline installation keeps showing outdated interviews, open [Update Debrief](https://ryanlmelvin.github.io/debrief-corn-game/update.html) and select **Load latest game**. This activates the published version without clearing saved progress.


The **Endings** screen lists endings in numerical order, labels them **Not yet unlocked** or **Achieved**, and keeps transcripts from the last 30 completed games, including interview answers, on this browser and device. Updating or starting a new game preserves achieved endings and transcripts from completed games. Earlier runs completed before this feature cannot be reconstructed; a saved ending is added when resumed.

Every map landmark now has a different exhibit each night. Gold markers show unread locations; a check marks a completed inspection for that night. Choosing to lead the final recovery team opens a guided field walk using the existing illustrated corn rows, boot prints, radio, and corner artwork. Tap Lead (or press W / Up) to follow the route, and tap Stop to wait. The route turns automatically and stops at each discovery for examination (E); Space also leads, stops, or examines the current discovery. Three route markers show progress. At the northeast corner, the camera faces the departing team automatically. The team retreats sideways into the corn at a steady scale. Rifle controls support pointer aiming, X to select and track a visible figure, Space to fire, and L to lower the rifle before any shot; on-screen controls also support touch. The first shot commits the player to the order and speeds up the retreat. All three casualties lead to a departmental cover-up; any survivors after ammunition runs out or someone reaches cover lead to arrest. Letting the team leave without firing saves all three. Each outcome includes two recorded debrief questions before the final disposition, unless the player interrupts the interview with the loaded rifle. The interrupted tape uses the short excerpt supplied by the author; the original manuscript is not included.

Choices display “You've already seen all these endings.” only when every possible ending is in the saved collection. The check previews the real transitions without changing the game, follows final debriefs and optional-route exits, and treats recovery outcomes separately. Open gameplay conservatively retains every ending; uncertain or unsupported choices receive no note. Adding an ending keeps it possible in conservative bounds automatically. Resolution transcript deduplication is only for detecting withdrawal loops; active transcripts still go through the real save validator. GitHub runs the test suite and checks on every push and pull request through `.github/workflows/checks.yml`.
