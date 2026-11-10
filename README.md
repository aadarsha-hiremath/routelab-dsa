# RouteLab

RouteLab is a graph-search studio for comparing the route an algorithm chooses, the weight of that route, and the work needed to find it. Phase 1 contains a framework-independent TypeScript engine and a small React workspace. The workspace starts empty. Open a graph file or explicitly load the campus example, choose an algorithm, and run it.

## Install and launch

Use Git, Node.js **24 LTS** (24.16 or newer in the 24.x line), and its bundled npm. CI uses the exact version in `.nvmrc`. Sign into GitHub with an account that has access to the private repository before cloning.

```sh
git clone https://github.com/aadarsha-hiremath/routelab-dsa.git
cd routelab-dsa
npm ci
npm run dev
```

Open the Local URL printed by Vite (normally <http://localhost:5173>). Press Ctrl+C to stop. For the production build and local preview:

```sh
npm run build
npm run preview
```

## Bring your own graph

Save a UTF-8 JSON document like this as `route.json` and choose **Open JSON file**. The example describes a one-way edge of cost 3. A larger editable example is in [examples/campus.json](examples/campus.json) and can be downloaded under **Graph file format** in the app.

```json
{
  "directed": true,
  "weighted": true,
  "start": "A",
  "destination": "B",
  "nodes": [
    { "id": "A", "x": 0, "y": 0 },
    { "id": "B", "x": 1, "y": 0 }
  ],
  "edges": [{ "from": "A", "to": "B", "weight": 3 }]
}
```

- Both flags and both arrays are required. Node IDs are unique, nonblank, case-sensitive strings. Coordinates and weights must be finite JSON numbers. Coordinates are metadata.
- Every edge references existing nodes. Weighted edges require a weight, including an explicit zero. Unweighted edges omit the field and have cost 1. Negative edges are valid for BFS and DFS. A single negative edge anywhere rules out Dijkstra and A*.
- Self-loops and duplicate edges are rejected. A directed graph can have opposite arcs. In an undirected graph, specifying the reverse of an existing edge is a duplicate.
- Isolated nodes, empty graphs, cycles, and disconnected components are supported by the model. The browser requires valid `start` and `destination` IDs in the file. Engine callers may set either endpoint per run. Edit the file and reopen it to change the graph.
- Files stay in the browser and are limited to 2 MiB. Parsing and search run in a Web Worker. The workspace displays at most the first and last ten nodes of a long path, with an omission count. The engine returns the full route. **Clear workspace** or reload to start empty.

## Search behavior

| Search | Frontier and order | Route guarantee |
| --- | --- | --- |
| BFS | FIFO array with a moving head. A node enters once. | Fewest edges. Total weight is reported separately. |
| DFS | Stack of adjacency iterators, implemented as indices. Continues the first available branch. | A reachable path. It can use more edges and have greater cost. |
| Dijkstra | Stable binary min-heap ordered by cumulative weight (g). | Minimum total weight on non-negative graphs. |
| A* | Same heap, ordered by g plus a heuristic (h). Improved scores can reopen nodes. | Minimum total weight when h is admissible, non-negative and zero at the goal. |

Adjacency lists follow input edge order. The heap breaks priority ties by insertion order. Equal-cost relaxations retain the first predecessor. Superseded heap entries are discarded before expansion. All searches stop on expanding the destination. Unreachable results have an empty path and null cost and hop count. Starting at the destination yields one expansion and zero cost.

A* defaults to h = 0, including in the browser. Engine callers can pass a deterministic function of the current node and destination. The engine checks finiteness, non-negativity, and zero at the goal. The caller must establish admissibility (h never exceeds the remaining minimum cost). An overestimate can produce a suboptimal route. The benchmark's Manhattan distance is admissible because each edge moves one grid unit and costs at least one. Arbitrary coordinates alone provide no such guarantee.

### Engine and execution events

```ts
import { parseGraph } from './src/engine/graph.ts'
import { search } from './src/engine/search.ts'

const graph = parseGraph(JSON.parse(jsonText))
const result = search(graph, 'dijkstra', {
  start: 'A', destination: 'B', traceLimit: 200
})
```

`parseGraph` validates unknown input and builds an immutable adjacency snapshot once. Reuse it across runs. `GraphDocument` describes the wire format for typed producers. Additional JSON fields are ignored. Costs use JavaScript numbers with ordinary floating-point rounding. Operations that overflow the finite range raise an error.

`visited` records expansion order including the goal. `expanded` counts expansion events, including repeat expansions if A* reopens a node. `path`, `hops`, `cost`, and `status` describe the actual result. All timing is external to search.

Trace recording defaults to off. A positive `traceLimit` captures a deterministic prefix of at most 10,000 events. `trace.truncated` flags discarded events once the limit is exceeded. The independent result remains complete. Disabling recording returns an empty trace with `truncated: false`.

| Event | Meaning |
| --- | --- |
| started / completed | Run endpoints and algorithm / terminal status. |
| discovered / frontier-added | First insertion of a node / each insertion, including improved weighted entries. |
| expanded | Search selected a current entry, including the destination. Stale entries are skipped. |
| edge-examined | A neighbor was inspected, even when already seen. |
| distance-updated | Initial g-score or a strictly improved g-score in a cost-based search. |
| destination-reached / path-reconstructed | Expansion of the goal / full route assembled in start-to-goal order. |

## Complexity

Let V be the number of nodes and E the number of adjacency entries (two per undirected edge). Graph construction uses expected O(V + E) time and space with hash maps and sets. Runs reuse the graph. Bounds below include the result and assume constant-time ID lookup and heuristic evaluation.

| Search | Worst-case time | Auxiliary and result space |
| --- | --- | --- |
| BFS / DFS | O(V + E) | O(V) |
| Dijkstra / A* with zero or consistent h | O(V + E log(E + 2)) | O(V + E) |
| A* with an inconsistent admissible h | O(V + S + P log(P + 1)) | O(V + P) |

S counts all adjacency entries scanned across expansions and P counts heap insertions including the start. Reopening can make these much larger than E. Lazy heap updates can retain old entries. A trace adds O(L) event records for configured limit L, with the reconstructed path shared with the result. With tracing disabled, no event history accumulates.

## Verify and benchmark

```sh
npm test
npm run typecheck
npm run build
npm run bench
```

Use `npm run test:watch` for local iteration. GitHub Actions performs a clean install, runs Vitest, and type-checks and builds on push and pull request.

Tests include exact traversal and event expectations, graph validation, stable heap ordering, stale entries, A* reopening, a 20,000-node chain, and an independent Floyd–Warshall distance oracle for every pair on seeded directed and undirected graphs.

The benchmark times complete engine searches with tracing disabled using a monotonic clock. It constructs two 100 × 100 grids outside the timed region: an open unit grid and a seeded weighted grid with barriers. Each row reports a median, minimum, and maximum over eleven measurements after three warmups, alongside the actual expanded count and route cost. Machine load, runtime, and hardware affect times.

## Project layout

| Location | Responsibility |
| --- | --- |
| `src/engine/graph.ts` | Graph types, validation, adjacency construction and read operations |
| `src/engine/search.ts` | Iterative traversals, shared weighted search, and result assembly |
| `src/engine/min-heap.ts`, `events.ts` | Stable priority queue and bounded execution trace |
| `src/app/`, `src/main.tsx` | React shell, worker protocol, local file handling and styles |
| `examples/` | Downloadable campus graph |
| `tests/` | Fixtures, graph and search tests, independent oracle |
| `benchmarks/` | Reproducible performance harness |
| `.github/workflows/` | CI workflow |

## Phase boundary

Phase 1 supports local JSON import and one search at a time. The browser keeps the current graph in memory for the session. Interactive editing, layout, animation and playback are reserved for a separately approved Phase 2 design. The engine provides immutable graph snapshots and bounded events for that work.

[MIT License](LICENSE)
