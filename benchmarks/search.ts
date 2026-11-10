import { performance } from 'node:perf_hooks'
import { cpus, platform, arch } from 'node:os'
import { parseGraph } from '../src/engine/graph.ts'
import type { EdgeInput } from '../src/engine/graph.ts'
import { search } from '../src/engine/search.ts'

function grid(side: number, obstacles: boolean) {
  const nodes = Array.from({ length: side * side }, (_, i) => ({
    id: String(i),
    x: i % side,
    y: Math.floor(i / side),
  }))
  const edges: EdgeInput[] = []
  let seed = 1729
  function add(from: number, to: number) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    edges.push({ from: String(from), to: String(to), weight: obstacles ? 1 + (seed % 9) : 1 })
  }
  for (const [i, node] of nodes.entries()) {
    if (node.x + 1 < side) add(i, i + 1)
    // Perforated horizontal barriers with repeatable gates.
    if (node.y + 1 < side && (!obstacles || node.y % 8 !== 7 || node.x % 13 === node.y % 13))
      add(i, i + side)
  }
  return parseGraph({
    directed: false,
    weighted: true,
    nodes,
    edges,
    start: '0',
    destination: String(nodes.length - 1),
  })
}

console.log('Node', process.version, platform(), arch(), cpus()[0]?.model)
console.log('Milliseconds per search. 3 warmups, 11 timed runs, seed 1729, tracing off.')
for (const obstacles of [false, true]) {
  const graph = grid(100, obstacles)
  console.log(
    '\n' + (obstacles ? 'Weighted barriers' : 'Open grid'),
    graph.nodes.length,
    'nodes,',
    graph.edgeCount,
    'edges',
  )
  const rows = []
  for (const name of ['bfs', 'dfs', 'dijkstra', 'astar-zero', 'astar-manhattan'] as const) {
    const algorithm = name === 'astar-zero' || name === 'astar-manhattan' ? 'astar' : name
    const options =
      name === 'astar-manhattan'
        ? {
            heuristic: (a: { x: number; y: number }, b: { x: number; y: number }) =>
              Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
          }
        : {}
    const run = () => search(graph, algorithm, options)
    for (let i = 0; i < 3; i++) run()
    const times: number[] = []
    let expanded = 0
    let cost: number | null = null
    for (let i = 0; i < 11; i++) {
      const begin = performance.now()
      const result = run()
      times.push(performance.now() - begin)
      if (result.status !== 'found') throw new Error('Expected a reachable benchmark destination.')
      expanded = result.expanded
      cost = result.cost
    }
    times.sort((a, b) => a - b)
    rows.push({
      search: name,
      median_ms: times[5]!.toFixed(2),
      min_ms: times[0]!.toFixed(2),
      max_ms: times[10]!.toFixed(2),
      expanded,
      cost,
    })
  }
  console.table(rows)
}
