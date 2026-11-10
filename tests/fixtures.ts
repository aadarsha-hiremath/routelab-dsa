import { parseGraph } from '../src/engine/graph.ts'
import type { GraphDocument } from '../src/engine/graph.ts'

export function fixture(
  ids: string[],
  edges: [string, string, number][],
  directed = true,
): GraphDocument {
  return {
    directed,
    weighted: true,
    nodes: ids.map((id, x) => ({ id, x, y: 0 })),
    edges: edges.map(([from, to, weight]) => ({ from, to, weight })),
    start: ids[0]!,
    destination: ids[ids.length - 1]!,
  }
}

export const routes = fixture(
  ['S', 'A', 'B', 'C', 'G'],
  [
    ['S', 'A', 2],
    ['S', 'B', 1],
    ['S', 'G', 12],
    ['A', 'C', 3],
    ['C', 'G', 2],
    ['B', 'C', 0],
    ['C', 'S', 0],
  ],
)
export const routeGraph = parseGraph(routes)
