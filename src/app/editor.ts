import { parseGraph } from '../engine/graph.ts'
import type { GraphDocument, GraphNode, EdgeInput } from '../engine/graph.ts'
import { edgeKey } from './playback.ts'

export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; index: number } | null
export type Workspace = { name: string; graph: GraphDocument }
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
// Edits create immutable snapshots. Remember the pristine/cleared snapshot across undo.
const pristine: Workspace = {
  name: 'Untitled graph',
  graph: { directed: false, weighted: true, nodes: [], edges: [] },
}
export const emptyWorkspace = (): Workspace => pristine
export const canDraw = (g: GraphDocument) => g.nodes.length <= 250 && g.edges.length <= 500
export function firstUnusedEdge(g: GraphDocument) {
  const used = new Set(g.edges.map((e) => edgeKey(e.from, e.to, g.directed)))
  for (const { id: from } of g.nodes) {
    for (const { id: to } of g.nodes) {
      if (from !== to && !used.has(edgeKey(from, to, g.directed))) return { from, to }
    }
  }
  return null
}
export function validate(input: unknown): GraphDocument {
  parseGraph(input)
  return input as GraphDocument
}
export function renameNode(g: GraphDocument, old: string, node: GraphNode): GraphDocument {
  if (!g.nodes.some((n) => n.id === old)) throw Error('Select an existing node.')
  const rename = (id: string) => (id === old ? node.id : id)
  return {
    ...g,
    nodes: g.nodes.map((n) => (n.id === old ? { ...n, ...node } : n)),
    edges:
      old === node.id
        ? g.edges
        : g.edges.map((e) => ({ ...e, from: rename(e.from), to: rename(e.to) })),
    ...(g.start === old ? { start: node.id } : {}),
    ...(g.destination === old ? { destination: node.id } : {}),
  }
}
export function removeSelected(g: GraphDocument, selected: NonNullable<Selection>): GraphDocument {
  if (selected.kind === 'edge')
    return { ...g, edges: g.edges.filter((_, i) => i !== selected.index) }
  const next = {
    ...g,
    nodes: g.nodes.filter((n) => n.id !== selected.id),
    edges: g.edges.filter((e) => e.from !== selected.id && e.to !== selected.id),
  }
  if (next.start === selected.id) delete next.start
  if (next.destination === selected.id) delete next.destination
  return next
}
export function nextNode(g: GraphDocument, x: number, y: number): GraphNode {
  const ids = new Set(g.nodes.map((n) => n.id))
  let i = g.nodes.length + 1
  while (ids.has('N' + i)) i++
  return { id: 'N' + i, x, y }
}
export function changeWeighted(g: GraphDocument, weighted: boolean): GraphDocument {
  return {
    ...g,
    weighted,
    edges: g.edges.map((e) => {
      const next: { -readonly [K in keyof EdgeInput]: EdgeInput[K] } = { ...e }
      if (weighted) next.weight = 1
      else delete next.weight
      return next
    }),
  }
}
export type History = { past: Workspace[]; present: Workspace; future: Workspace[] }
export function initialHistory(): History {
  return { past: [], present: emptyWorkspace(), future: [] }
}
function trim(items: Workspace[]) {
  let units = 0,
    start = items.length
  while (start > 0 && items.length - start < 50) {
    const g = items[start - 1]!.graph
    const size = g.nodes.length + g.edges.length
    if (units + size > 100_000 && start < items.length) break
    units += size
    start--
  }
  return items.slice(start)
}
export function commit(h: History, present: Workspace): History {
  return { past: trim([...h.past, h.present]), present, future: [] }
}
export function travel(h: History, back: boolean): History {
  const stack = back ? h.past : h.future
  const present = stack.at(-1)
  if (!present) return h
  return back
    ? { past: stack.slice(0, -1), present, future: [...h.future, h.present] }
    : { past: [...h.past, h.present], present, future: stack.slice(0, -1) }
}
