import { describe, expect, it } from 'vitest'
import { search } from '../src/engine/search.ts'
import { parseGraph } from '../src/engine/graph.ts'
import type { Algorithm } from '../src/engine/events.ts'
import { fixture, routeGraph, routes } from './fixtures.ts'

const algorithms: Algorithm[] = ['bfs', 'dfs', 'dijkstra', 'astar']
const expected = {
  bfs: { path: ['S', 'G'], visited: ['S', 'A', 'B', 'G'], cost: 12 },
  dfs: { path: ['S', 'A', 'C', 'G'], visited: ['S', 'A', 'C', 'G'], cost: 7 },
  dijkstra: { path: ['S', 'B', 'C', 'G'], visited: ['S', 'B', 'C', 'A', 'G'], cost: 3 },
  astar: { path: ['S', 'B', 'C', 'G'], visited: ['S', 'B', 'C', 'A', 'G'], cost: 3 },
}

describe.each(algorithms)('%s', (algorithm) => {
  it('returns the expected traversal, route and actual weight', () => {
    const result = search(routeGraph, algorithm)
    expect(result).toMatchObject({
      ...expected[algorithm],
      status: 'found',
      expanded: expected[algorithm].visited.length,
      hops: expected[algorithm].path.length - 1,
    })
  })
  it('honors directed reachability and reports disconnected destinations', () => {
    const graph = parseGraph(
      fixture(
        ['A', 'B', 'C', 'D'],
        [
          ['A', 'B', 1],
          ['C', 'D', 1],
        ],
      ),
    )
    expect(search(graph, algorithm)).toMatchObject({
      status: 'unreachable',
      visited: ['A', 'B'],
      path: [],
      cost: null,
      hops: null,
    })
    expect(search(graph, algorithm, { start: 'B', destination: 'A' }).visited).toEqual(['B'])
  })
  it('uses unit weights and can traverse the reverse of an undirected edge', () => {
    const graph = parseGraph({
      ...routes,
      weighted: false,
      directed: false,
      edges: [
        { from: 'A', to: 'S' },
        { from: 'G', to: 'A' },
      ],
    })
    expect(search(graph, algorithm)).toMatchObject({ path: ['S', 'A', 'G'], cost: 2, hops: 2 })
  })
  it('finishes immediately at the starting node', () => {
    const result = search(routeGraph, algorithm, { destination: 'S', traceLimit: 50 })
    expect(result).toMatchObject({
      status: 'found',
      path: ['S'],
      visited: ['S'],
      cost: 0,
      hops: 0,
      expanded: 1,
    })
    expect(result.trace.events.some((event) => event.type === 'edge-examined')).toBe(false)
  })
  it('breaks ties by input order, including equal-cost alternatives', () => {
    const graph = parseGraph(
      fixture(
        ['S', 'A', 'B', 'G'],
        [
          ['S', 'B', 1],
          ['S', 'A', 1],
          ['A', 'G', 0],
          ['B', 'G', 0],
        ],
      ),
    )
    const first = search(graph, algorithm, { traceLimit: 100 })
    expect(first.path).toEqual(['S', 'B', 'G'])
    expect(search(graph, algorithm, { traceLimit: 100 })).toEqual(first)
  })
  it('records a bounded deterministic prefix and truthful terminal events', () => {
    const full = search(routeGraph, algorithm, { traceLimit: 1000 })
    const { events } = full.trace
    expect(events[0]).toEqual({ type: 'started', algorithm, start: 'S', destination: 'G' })
    expect(events.slice(-3)).toEqual([
      { type: 'destination-reached', node: 'G' },
      { type: 'path-reconstructed', path: full.path },
      { type: 'completed', status: 'found' },
    ])
    expect(events.filter((e) => e.type === 'expanded').map((e) => e.node)).toEqual(full.visited)
    expect(events.some((e) => e.type === 'distance-updated')).toBe(
      ['astar', 'dijkstra'].includes(algorithm),
    )
    expect(search(routeGraph, algorithm, { traceLimit: 3 }).trace).toEqual({
      events: events.slice(0, 3),
      truncated: true,
    })
    expect(search(routeGraph, algorithm, { traceLimit: events.length }).trace.truncated).toBe(false)
    expect(search(routeGraph, algorithm).trace).toEqual({ events: [], truncated: false })
  })
})

it.each(['dijkstra', 'astar'] as const)(
  '%s rejects a negative edge even in another component',
  (algorithm) => {
    const graph = parseGraph(
      fixture(
        ['S', 'X', 'Y', 'G'],
        [
          ['S', 'G', 1],
          ['X', 'Y', -1],
        ],
      ),
    )
    expect(() => search(graph, algorithm, { destination: 'S' })).toThrow(/non-negative/)
  },
)
it('traversal reports the actual signed path cost', () => {
  expect(search(parseGraph(fixture(['S', 'G'], [['S', 'G', -2]])), 'bfs').cost).toBe(-2)
})
it('A* reopens an expanded node with an admissible inconsistent heuristic', () => {
  const graph = parseGraph(
    fixture(
      ['S', 'A', 'B', 'G'],
      [
        ['S', 'A', 3],
        ['S', 'B', 1],
        ['B', 'A', 1],
        ['A', 'G', 3],
      ],
    ),
  )
  const result = search(graph, 'astar', {
    heuristic: (n) => (n.id === 'B' ? 4 : 0),
    traceLimit: 100,
  })
  expect(result).toMatchObject({
    path: ['S', 'B', 'A', 'G'],
    visited: ['S', 'A', 'B', 'A', 'G'],
    expanded: 5,
    cost: 5,
  })
  expect(result.trace.events.filter((e) => e.type === 'discovered' && e.node === 'A')).toHaveLength(
    1,
  )
  expect(result.trace.events).toContainEqual({
    type: 'distance-updated',
    node: 'A',
    previous: 3,
    cost: 2,
  })
})
it('zero fallback ignores coordinates and both cost searches discard stale entries', () => {
  const doc = fixture(
    ['S', 'B', 'A', 'G'],
    [
      ['S', 'G', 30],
      ['S', 'A', 8],
      ['S', 'B', 1],
      ['B', 'A', 1],
      ['A', 'G', 10],
    ],
  )
  const graph = parseGraph({
    ...doc,
    nodes: doc.nodes.map((n) => ({ ...n, x: n.id === 'B' ? 10000 : 0 })),
  })
  for (const algorithm of ['astar', 'dijkstra'] as const) {
    expect(search(graph, algorithm)).toMatchObject({
      cost: 12,
      path: ['S', 'B', 'A', 'G'],
      visited: ['S', 'B', 'A', 'G'],
    })
  }
})
it('detects nonfinite accumulated cost', () => {
  const graph = parseGraph(
    fixture(
      ['a', 'b', 'c'],
      [
        ['a', 'b', Number.MAX_VALUE],
        ['b', 'c', Number.MAX_VALUE],
      ],
    ),
  )
  for (const algorithm of algorithms)
    expect(() => search(graph, algorithm)).toThrow(/finite number range/)
})
it('validates endpoints, algorithm, trace bounds and heuristic values', () => {
  expect(() => search(routeGraph, 'oops' as Algorithm)).toThrow(/algorithm/)
  expect(() => search(routeGraph, 'dfs', { start: 'missing' })).toThrow(/node/)
  for (const limit of [-1, 0.5, 10001, Infinity]) {
    expect(() => search(routeGraph, 'bfs', { traceLimit: limit })).toThrow(/Trace limit/)
  }
  for (const value of [-1, Infinity, NaN]) {
    expect(() =>
      search(routeGraph, 'astar', { heuristic: (n) => (n.id === 'G' ? 0 : value) }),
    ).toThrow(/Heuristic/)
  }
  expect(() => search(routeGraph, 'astar', { heuristic: () => 1 })).toThrow(/destination/)
  expect(() => search(routeGraph, 'bfs', { heuristic: () => 0 })).toThrow(/only/)
})
it('all algorithms finish a deep 20,000-node chain with bounded history', () => {
  const ids = Array.from({ length: 20000 }, (_, i) => String(i))
  const graph = parseGraph(
    fixture(
      ids,
      ids.slice(1).map((id, i) => [ids[i]!, id, 1]),
    ),
  )
  for (const algorithm of algorithms) {
    const r = search(graph, algorithm, { traceLimit: 8 })
    expect(r.path).toEqual(ids)
    expect(r.cost).toBe(19999)
    expect(r.expanded).toBe(20000)
    expect(r.trace.events).toHaveLength(8)
    expect(r.trace.truncated).toBe(true)
  }
})
