import type { ReactFlowInstance, Rect, XYPosition } from '@xyflow/react'
import type { GraphDocument } from '../engine/graph.ts'

type Size = Pick<Rect, 'width' | 'height'>
export const snapGrid: [number, number] = [16, 16]
const clearance = 18 // Flow units, including room for connection handles and selection outlines.

/** Find the closest legal top-left position on the requested grid. */
export function nearestPlacement(
  view: Rect,
  size: Size,
  obstacles: Rect[],
  target: XYPosition,
  grid: number,
): XYPosition | null {
  const up = (v: number) => Math.ceil(v / grid) * grid
  const down = (v: number) => Math.floor(v / grid) * grid
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
  const left = up(view.x + clearance),
    right = down(view.x + view.width - size.width - clearance)
  const top = up(view.y + clearance),
    bottom = down(view.y + view.height - size.height - clearance)
  if (right < left || bottom < top) return null
  const preferred = { x: Math.round(target.x / grid) * grid, y: Math.round(target.y / grid) * grid }
  const columns = new Set([clamp(preferred.x, left, right)])
  // A closer column can only become available at the side of an obstacle.
  for (const r of obstacles) {
    columns.add(clamp(down(r.x - size.width - clearance), left, right))
    columns.add(clamp(up(r.x + r.width + clearance), left, right))
  }
  const ordered = [...obstacles].sort((a, b) => a.y - b.y)
  let best: XYPosition | null = null
  let distance = Infinity
  for (const x of columns) {
    let first = top
    const consider = (last: number) => {
      if (first > last) return
      const y = clamp(preferred.y, first, last)
      const d = (x - target.x) ** 2 + (y - target.y) ** 2
      if (d < distance) {
        best = { x, y }
        distance = d
      }
    }
    for (const r of ordered) {
      if (x + size.width + clearance <= r.x || x >= r.x + r.width + clearance) continue
      consider(Math.min(bottom, down(r.y - size.height - clearance)))
      first = Math.max(first, up(r.y + r.height + clearance))
      if (first > bottom) break
    }
    consider(bottom)
  }
  return best
}

// Use the vertex CSS for labels React Flow hasn't measured yet, including the new node.
function measureVertex(canvas: Element, label: string, badge: string): Size {
  const probe = document.createElement('div')
  probe.className = 'vertex'
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', width: 'max-content' })
  probe.append(document.createElement('i'), label)
  if (badge) {
    const role = document.createElement('small')
    role.textContent = badge
    probe.append(role)
  }
  canvas.append(probe)
  const size = { width: probe.offsetWidth, height: probe.offsetHeight }
  probe.remove()
  return size
}

export function placeNode(
  canvas: Element,
  flow: ReactFlowInstance,
  graph: GraphDocument,
  id: string,
  snap: boolean,
  point?: XYPosition,
) {
  function bounds(element: Element): Rect {
    const box = element.getBoundingClientRect()
    const origin = flow.screenToFlowPosition({ x: box.left, y: box.top }, { snapToGrid: false })
    return { ...origin, width: box.width / flow.getZoom(), height: box.height / flow.getZoom() }
  }
  const view = bounds(canvas)
  const start = graph.start ?? id
  const destination = graph.destination ?? (graph.nodes.length ? id : undefined)
  const badge = (label: string) =>
    [label === start ? 'S' : '', label === destination ? 'D' : ''].filter(Boolean).join('/')
  const size = measureVertex(canvas, id, badge(id))
  const occupied = graph.nodes.map((n, i) => {
    const node = flow.getInternalNode('n' + i)
    const measured = node?.measured
    const dimensions =
      measured?.width && measured.height && node?.data.label === n.id
        ? { width: measured.width, height: measured.height }
        : measureVertex(canvas, n.id, badge(n.id))
    return { x: n.x, y: n.y, ...dimensions }
  })
  for (const overlay of canvas.querySelectorAll(
    '.canvas-tools, .canvas-legend, .react-flow__panel',
  )) {
    occupied.push(bounds(overlay))
  }
  const target = point ?? {
    x: view.x + (view.width - size.width) / 2,
    y: view.y + (view.height - size.height) / 2,
  }
  return nearestPlacement(view, size, occupied, target, snap ? snapGrid[0] : 1)
}
