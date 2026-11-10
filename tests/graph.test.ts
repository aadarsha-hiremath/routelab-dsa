import { describe, expect, it } from 'vitest'
import { parseGraph } from '../src/engine/graph.ts'
import { MinHeap } from '../src/engine/min-heap.ts'
import { fixture } from './fixtures.ts'

const base = fixture(['a', 'b'], [['a', 'b', 0]])
describe('graph import', () => {
  it('preserves opposite directed arcs and edge order', () => {
    const graph = parseGraph(
      fixture(
        ['a', 'b'],
        [
          ['b', 'a', 3],
          ['a', 'b', 4],
        ],
      ),
    )
    expect(graph.neighbors('a')).toEqual([{ to: 'b', weight: 4 }])
    expect(graph.neighbors('b')).toEqual([{ to: 'a', weight: 3 }])
    expect(graph.edgeCount).toBe(2)
  })
  it('stores an undirected edge once logically, with two adjacency entries', () => {
    const graph = parseGraph({ ...base, directed: false })
    expect(graph.edgeCount).toBe(1)
    expect(graph.neighbors('b')).toEqual([{ to: 'a', weight: 0 }])
  })
  it('isolates the immutable snapshot from caller mutation', () => {
    const nodes = [
      { id: 'a', x: 1, y: 2 },
      { id: 'b', x: 3, y: 4 },
    ]
    const edges = [{ from: 'a', to: 'b', weight: 8 }]
    const graph = parseGraph({ ...base, nodes, edges })
    nodes[0]!.x = 8
    edges[0]!.weight = 15
    expect(graph.node('a').x).toBe(1)
    expect(graph.neighbors('a')[0]?.weight).toBe(8)
    expect(Object.isFrozen(graph.neighbors('a'))).toBe(true)
    expect(Object.isFrozen(graph.neighbors('a')[0])).toBe(true)
  })
  it('accepts empty graphs and opaque IDs', () => {
    expect(parseGraph({ directed: false, weighted: false, nodes: [], edges: [] }).nodes).toEqual([])
    expect(parseGraph(fixture(['__proto__', 'a→b'], [])).node('__proto__').id).toBe('__proto__')
  })
  const invalid: [string, unknown][] = [
    ['null', null],
    ['directed flag', { ...base, directed: 1 }],
    ['weighted flag', { ...base, weighted: null }],
    ['node list', { ...base, nodes: {} }],
    ['edge list', { ...base, edges: 'ab' }],
    ['node record', { ...base, nodes: [null] }],
    ['blank id', { ...base, nodes: [{ id: '  ', x: 0, y: 0 }] }],
    ['duplicate id', { ...base, nodes: [...base.nodes, base.nodes[0]] }],
    ['coordinate', { ...base, nodes: [{ id: 'a', x: Infinity, y: 0 }] }],
    ['missing endpoint', { ...base, edges: [{ from: 'a', to: 'c', weight: 1 }] }],
    ['bad start', { ...base, start: null }],
    ['bad destination', { ...base, destination: 'c' }],
    ['self-loop', fixture(['a'], [['a', 'a', 0]])],
    ['duplicate edge', { ...base, edges: [...base.edges, ...base.edges] }],
    [
      'reverse duplicate',
      fixture(
        ['a', 'b'],
        [
          ['a', 'b', 0],
          ['b', 'a', 1],
        ],
        false,
      ),
    ],
    ['missing weight', { ...base, edges: [{ from: 'a', to: 'b' }] }],
    ['nonfinite weight', fixture(['a', 'b'], [['a', 'b', NaN]])],
    ['weight on unweighted edge', { ...base, weighted: false }],
  ]
  it.each(invalid)('rejects %s', (_, input) => {
    expect(() => parseGraph(input)).toThrow()
  })
})

it('heap matches stable priority ordering across interleaved insertions', () => {
  const heap = new MinHeap<number>()
  expect(heap.pop()).toBeUndefined()
  const items = Array.from({ length: 257 }, (_, index) => ({ index, priority: (index * 17) % 13 }))
  for (const { index, priority } of items) heap.push(index, priority)
  expect(heap.pop()).toBe(0)
  heap.push(999, -1)
  expect(heap.pop()).toBe(999)
  const expected = items
    .slice(1)
    .sort((a, b) => a.priority - b.priority)
    .map((item) => item.index)
  expect(expected.map(() => heap.pop())).toEqual(expected)
  expect(heap.size).toBe(0)
})
