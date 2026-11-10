import { expect, it } from 'vitest'
import { fixture } from './fixtures.ts'
import { parseGraph } from '../src/engine/graph.ts'
import { search } from '../src/engine/search.ts'

it('matches independent Floyd–Warshall distances for every endpoint pair in seeded graphs', () => {
  let state = 1729
  function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
  const ids = Array.from({ length: 10 }, (_, i) => String(i))
  for (const directed of [true, false]) {
    for (let trial = 0; trial < 6; trial++) {
      const edges: [string, string, number][] = []
      const distances = ids.map((_, i) => ids.map((__, j) => (i === j ? 0 : Infinity)))
      for (let i = 0; i < ids.length; i++) {
        for (let j = 0; j < ids.length; j++) {
          if (i === j || (!directed && j < i) || random() > 0.24) continue
          const cost = Math.floor(random() * 8)
          edges.push([ids[i]!, ids[j]!, cost])
          distances[i]![j] = cost
          if (!directed) distances[j]![i] = cost
        }
      }
      for (let k = 0; k < ids.length; k++)
        for (let i = 0; i < ids.length; i++)
          for (let j = 0; j < ids.length; j++)
            distances[i]![j] = Math.min(distances[i]![j]!, distances[i]![k]! + distances[k]![j]!)

      const graph = parseGraph(fixture(ids, edges, directed))
      for (const [i, start] of ids.entries()) {
        for (const [j, destination] of ids.entries()) {
          for (const algorithm of ['dijkstra', 'astar'] as const) {
            const r = search(graph, algorithm, { start, destination })
            const optimum = distances[i]![j]!
            expect(r.cost).toBe(Number.isFinite(optimum) ? optimum : null)
            if (!Number.isFinite(optimum)) {
              expect(r.path).toEqual([])
              continue
            }
            expect(r.path[0]).toBe(start)
            expect(r.path.at(-1)).toBe(destination)
            const actual = r.path
              .slice(1)
              .reduce(
                (total, id, k) =>
                  total + graph.neighbors(r.path[k]!).find((e) => e.to === id)!.weight,
                0,
              )
            expect(actual).toBe(optimum)
          }
        }
      }
    }
  }
})
