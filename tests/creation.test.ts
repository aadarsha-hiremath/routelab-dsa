import { expect, it } from 'vitest'
import campus from '../examples/campus.json'
import { firstUnusedEdge, validate } from '../src/app/editor.ts'
import { nearestPlacement } from '../src/app/placement.ts'

const view = { x: -200, y: -100, width: 400, height: 200 }
const size = { width: 80, height: 42 }

it('uses the preferred position when its complete footprint fits', () => {
  expect(nearestPlacement(view, size, [], { x: -40, y: -21 }, 1)).toEqual({ x: -40, y: -21 })
})
it('finds the nearest snapped gap beside a wide measured node', () => {
  const obstacle = { x: -200, y: -100, width: 240, height: 200 }
  expect(nearestPlacement(view, size, [obstacle], { x: -40, y: -21 }, 16)).toEqual({
    x: 64,
    y: -16,
  })
})
it('reports a full viewport and a viewport smaller than the new node', () => {
  expect(nearestPlacement(view, size, [view], { x: 0, y: 0 }, 1)).toBeNull()
  expect(nearestPlacement({ ...view, width: 40 }, size, [], { x: 0, y: 0 }, 16)).toBeNull()
})
it('chooses the first unused campus pair in document order', () => {
  expect(firstUnusedEdge(campus)).toEqual({ from: 'Library', to: 'Garden' })
})
it.each([false, true])('distinguishes opposite arcs with weighted=%s', (weighted) => {
  const base = {
    nodes: campus.nodes.slice(0, 2),
    weighted,
    directed: true,
    edges: [{ from: 'Library', to: 'Courtyard', ...(weighted ? { weight: 3 } : {}) }],
  }
  const reverse = { from: 'Courtyard', to: 'Library' }
  expect(firstUnusedEdge(base)).toEqual(reverse)
  const undirected = { ...base, directed: false }
  expect(firstUnusedEdge(undirected)).toBeNull()
  const edges = [...base.edges, { ...reverse, ...(weighted ? { weight: 1 } : {}) }]
  expect(() => validate({ ...undirected, edges })).toThrow(/duplicate/i)
  expect(firstUnusedEdge({ ...base, edges })).toBeNull()
})
