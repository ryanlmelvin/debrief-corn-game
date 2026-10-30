# Working on Debrief

The user wants changes published as work proceeds so they can test directly on GitHub Pages.

- After completing and checking a coherent change, commit it and push directly to GitHub `main`; do not stop at a local change or open a pull request unless the user requests one.
- Publish the game from `docs/` on GitHub Pages and verify the deployment. The live URL is https://ryanlmelvin.github.io/debrief-corn-game/.
- Bump the cache version in `docs/sw.js` whenever shipped assets change. Preserve the in-game “Update ready. Download?” flow, which saves progress, activates the waiting worker, and reloads.
- Preserve the existing background art and color scheme unless the user asks to change them.
- Run `npm test` and `npm run check` before publishing.
- Never include the original short-story manuscript in the repository or deployment.
