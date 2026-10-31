# Working on Debrief

The user wants changes published as work proceeds so they can test directly on GitHub Pages.

- After completing and checking a coherent change, commit it and push directly to GitHub `main`; do not stop at a local change or open a pull request unless the user requests one.
- Publish the game from `docs/` on GitHub Pages and verify the deployment. The live URL is https://ryanlmelvin.github.io/debrief-corn-game/.
- Bump the cache version in `docs/sw.js` whenever shipped assets change. Preserve the in-game “Update ready. Download?” flow, which saves progress, activates the waiting worker, and reloads.
- Preserve the existing background art and color scheme unless the user asks to change them.
- Run `npm test` and `npm run check` before publishing.
- Never include the original short-story manuscript in the repository or deployment.

## Ending-choice hint safety

- “You've already seen all these endings.” is a claim about every reachable ending after that choice, including later withdrawals and alternate actions. If any continuation is uncertain, suppress the hint or retain a conservative superset of endings. Never infer reachability from a route name or the encounter director's prerequisite protection.
- When adding or changing an ending, decision action, prerequisite, withdrawal, or timing-dependent outcome, review `docs/seen-endings.js` and add regression coverage in `tests/seen-endings.test.mjs` in the same change. Use the real transitions; do not duplicate game rules in hint metadata.
- For each affected choice, establish its reachable endings using actual gameplay transitions. Test that omitting each reachable ending from an otherwise complete collection prevents the hint, and that the hint appears when every proven possibility is collected. Cover locked and unsupported choices, backtracking, guide outcome identities and ammunition, and any timed inputs. Previewing must leave saves, transcripts, history, and randomness unchanged.
- Timing-dependent controls must not claim a fixed outcome from the time they were rendered. Do not narrow conservative bounds or add recovery exclusions without demonstrating that every excluded ending is unreachable and adding regression tests for the affected branches.
- Every ending ID must have an explicit review and rationale in `scripts/check-ending-hints.mjs`. Its registry audit runs in `npm run check` and must fail for an unreviewed new ending. Update the review only after checking the relevant transitions and tests; do not auto-populate it from `ENDINGS` or bypass the audit.
- Run both `npm test` and `npm run check` before publishing these changes, including the ending-hint policy and behavior regressions.
- Keep `.github/workflows/checks.yml` running both checks on pushes and pull requests; a failing ending audit or missing regression fixture is a release failure, not a warning to bypass.
