# RouteLab v0.3.0 — Release readiness and measured performance

RouteLab v0.3.0 includes local graph recovery in the interactive studio. Every committed edit schedules a versioned IndexedDB transaction. A save succeeds when the transaction completes. An older tab can keep editing or export its copy, but a revision check protects work another tab has saved or cleared. The graph engine, worker search algorithms and JSON document format are the Phase 2 implementations.

Returning visitors choose whether to restore or discard. Dismissing the prompt keeps the saved graph. Preferences persist independently. This phase also restores keyboard focus to dialog openers, keeps Settings accessible on narrow screens, and writes compact backups when pretty-printing would push a valid import past 2 MiB.

## Verification

- [x] Verified the Phase 2 merge `ff0fde01803de388152b5671d49ad04668b6c221` as the Phase 3 starting point and Phase 3 merge `705ad245e73ec6aef5fa1a1d6b231e1873b54118` into `main`.
- [x] Used an independent Windows checkout of the branch with the candidate source files and a clean `npm ci`. Ran the dev server, loaded Campus paths, saved it, type-checked the project and built the production bundle.
- [x] Passed all 79 Vitest tests, including the 76 existing tests. Coverage includes the four search algorithms, a shortest-path oracle, unreachable destinations, a 20,000-node chain, deterministic traces, worker cancellation and stale replies.
- [x] Passed 17 functional Playwright tests and both browser performance workflows. Tests covered placement after pan and zoom, snapping, undo/redo, unused edge defaults, weight conversion, deletion, import/export, comparison metrics and playback. The 3,000-node overview returned the full 2,999-hop route and allowed stepping at the 10,000-event recording limit.
- [x] Completely closed and relaunched Chrome using the same profile. Compared the restored document with its JSON export after edits to identifiers, coordinates, endpoints, weights and direction. Checked its name and metadata, all six preference controls, System theme changes and reset defaults.
- [x] Exercised explicit clear, restore, dismiss, discard, blocked storage, invalid and future records, an injected quota failure, overlapping writes and concurrent tabs. A failed write retained the prior copy. Retrying saved the latest edit. Undo and redo after a clear produced the expected recovery state.
- [x] Inspected the actual production screenshots of the studio and recovery dialog. Checked keyboard activation and focus return, long node labels, mobile drawers and Settings access at 320, 390 and 1440 CSS pixels. Sampled text contrast in both themes.
- [x] Reviewed Git author and committer identities, tracked files and history, release screenshots, import validation and dependency advisories. The workflow grants read-only repository contents access.
- [x] Owner manually reviewed and accepted the graph recovery, settings persistence, and core workflows. GitHub publication and release approval remain separate decisions.

GitHub Actions on `main` runs an independent clean checkout and install, Vitest, strict TypeScript compilation through the production build, and functional Chromium workflows. The local benchmarks below have no timing threshold in CI. [CI run history on main](https://github.com/aadarsha-hiremath/routelab-dsa/actions/workflows/ci.yml?query=branch%3Amain). The latest release-preparation workflow also passed on commit `fb9556abfb787564bf72c840262413de31bfad73`.

## Measured performance

These measurements came from Windows x64 on an Intel Core i7-14650HX using Node 24.22.2 and headless Chrome 157.0.8103.39. The engine benchmark uses seed 1729, three warmups and eleven timed searches per case with tracing disabled. Times below are medians in milliseconds.

| 10,000-node workload | BFS | DFS | Dijkstra | A* with zero heuristic | A* with Manhattan distance |
| --- | ---: | ---: | ---: | ---: | ---: |
| Open grid, 19,800 edges | 3.41 | 3.42 | 4.33 | 3.80 | 5.30 |
| Weighted barriers, 18,693 edges | 3.81 | 2.97 | 5.24 | 5.99 | 5.75 |

Dijkstra and both A* variants returned cost 608 on the weighted barriers. The studio uses the zero heuristic. The benchmark's Manhattan heuristic applies to these grid fixtures.

| Browser measurement | 250 nodes, 500 edges | 22 nodes, 462 edges |
| --- | ---: | ---: |
| File selection through visible saved confirmation | 376 ms | 354 ms |
| IndexedDB document put, synchronous call | 0.4 ms | 0.1 ms |
| Start of put through transaction completion callback | 179.5 ms | 167.6 ms |
| Zoom click through second animation frame | 16.8 ms | 9.2 ms |
| Scripted 12-move pan with viewport verification | 260.5 ms | 172.6 ms |
| Playback frame interval, median / 95th percentile | 6.1 / 12.2 ms | 12.1 / 24.3 ms |
| Renderer JS heap sampled after playback | 48.5 MiB | 38.1 MiB |

The two shapes ran successively in one page. The initial renderer JS heap was 3.0 MiB. These are snapshots of the main page's JS heap. Worker, native renderer and GPU allocations are outside that measurement. Import and pan durations include the test driver and UI. The asynchronous save duration includes browser scheduling and dispatch of the completion callback.

On a separate 144-node/264-edge grid with 1,106 trace events, the median edit and scrub times through the second frame were 29.8 ms and 45.0 ms. Drag frame intervals were 6.1 ms at both the median and 95th percentile. Rendering cadence and storage latency vary across hardware and browser profiles.

## Accessibility, security and operating limits

- Sampled contrast for normal text on panel backgrounds was 15.34:1 dark and 15.27:1 light. Secondary text measured 7.51:1 and 6.75:1. Primary button text measured 9.82:1 and 6.00:1. These checks cover selected color pairs and keyboard/browser workflows. Manual screen-reader and physical-device testing remain outside this verification.
- The locked dependency audit reported zero known vulnerabilities. History and source scanning found no personal emails, recognized credential patterns, tracked environment files or private user-directory paths. Screenshots use the bundled campus example. React renders identifiers as text, including the markup-like ID exercised by the browser tests. These are point-in-time checks with finite pattern and advisory coverage.
- Import accepts at most 2 MiB of JSON and validates the graph before replacing the document. Larger graphs switch to overview above 250 nodes or 500 edges. An edited document can grow beyond the import limit. Keep its full backup and reduce a copy to reimport.
- Recovery holds one local document per browser profile and origin. Site-data removal and eviction can erase it. A process or device failure before the save completes can lose pending work. Browser policy governs navigation warnings and storage availability. Use JSON exports for independent backups. Concurrent edits require the user to reconcile their copies.
- Local browser checks used Chrome on Windows. CI targets Chromium on Linux. Safari, Firefox, physical power loss and device-wide memory consumption were outside this audit.

Installation, reproduction commands and Windows troubleshooting are in the [project guide](../README.md).
