# RouteLab v0.3.0 — Release notes (prepared, not published)

**Status:** Prepared for owner review. No Git tag or GitHub Release has been published by this preparation step.

RouteLab is a browser-based graph-search and pathfinding studio built with React, TypeScript, and React Flow. It provides a real editable graph, algorithm traces, and side-by-side search comparisons.

## Highlights

- **Graph studio:** Add, drag, rename, and delete nodes; connect directed or undirected edges; edit weights and endpoints; use zoom, pan, minimap, undo/redo, import/export, and explicit example graphs.
- **Four algorithms:** BFS, DFS, Dijkstra, and A*, with documented correctness constraints. BFS minimizes hops, DFS does not guarantee an optimal route, and Dijkstra/A* with the browser's zero heuristic find minimum-cost routes on non-negative graphs.
- **Execution playback:** Frontier/visited/path visualization, step controls, play/pause, speed selection, a timeline, and an execution log driven by real search events.
- **Algorithm comparison:** Real path cost, hops, expansion counts, status, and measured worker search times for the same graph.
- **Browser preferences:** Dark/light/system theme, playback speed, reduced motion, grid, snapping, and minimap settings persist locally.
- **Graph recovery:** Committed edits are saved in IndexedDB. Returning users choose to restore or discard the previous workspace. Save feedback distinguishes in-progress writes, committed saves, and failures. First-time users start with an empty graph.
- **Safety and quality:** Input validation, structured tests for algorithm correctness and editor behavior, browser tests covering recovery and settings across browser restarts, and GitHub Actions CI.

## Requirements and installation

- Git and Node.js **24.16 or newer within 24.x** with npm. The checked-in `.nvmrc` uses **24.22.2**.
- Modern browser. The application runs locally through Vite; this release preparation does **not** include a hosted website or standalone installer.

On Windows PowerShell:

```powershell
git clone --branch main https://github.com/aadarsha-hiremath/routelab-dsa.git
cd routelab-dsa
npm.cmd ci
npm.cmd run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). For tests, run `npm.cmd test`, `npm.cmd run typecheck`, and `npm.cmd run build`; see [README](../README.md) for browser-test setup.

## Verification evidence

During Phase 3 verification, the implementation author reported:
- **79/79** Vitest tests passed.
- **17/17** functional Playwright tests passed on Windows Chrome; the Chromium browser suite passed in CI.
- **2/2** browser performance workflows passed.
- A clean install, strict TypeScript check, and production build passed on Windows Node.js 24.22.2.
- A point-in-time dependency audit reported **zero known vulnerabilities**.

The owner separately tested and confirmed graph recovery and settings persistence. These results describe specific runs and environments, not guarantees on every machine. **Before publishing a release, check the latest GitHub Actions run on `main` after the version and documentation commits.**

## Limitations

- Graph autosave and preferences are **local to the browser profile and site origin**, not cloud-synchronized. Clearing site data can remove them. Export JSON for a portable backup.
- A save that has not reached **Saved locally** may be lost if the browser or computer terminates. Multiple tabs editing the same graph require manual reconciliation.
- Graph imports are limited to **2 MiB** of JSON. The interactive canvas supports up to **250 nodes and 500 edges**; larger valid graphs use overview mode for searching, comparison, and export.
- Event recordings hold at most **10,000 events**; a truncated recording is labeled as partial even when the complete search result remains available.
- Arbitrary graph coordinates are not automatically valid A* heuristics; the browser uses the **zero heuristic**.
- Browser verification focused on Windows Chrome and Linux Chromium. Safari, Firefox, mobile hardware, physical power loss, and manual screen-reader testing are not fully verified.

See [detailed release readiness and benchmark notes](release-readiness.md) for test coverage, measurements, and additional limitations.

## Publication checklist

- [x] Source changes from Phase 3 merged into `main`.
- [x] README updated to install from `main`.
- [x] Package and lockfile set to `0.3.0`.
- [x] Release notes prepared.
- [ ] Verify the **latest** CI workflow on `main` passes after preparation commits.
- [ ] Owner explicitly approves public visibility and/or tag and GitHub Release.
- [ ] If approved, publish tag `v0.3.0` from the intended release commit and enter these notes in the GitHub release.

**Do not treat this document as proof that a GitHub Release has been published.**
