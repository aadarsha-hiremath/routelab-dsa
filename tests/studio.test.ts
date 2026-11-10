import { describe, it, expect, vi } from 'vitest'
import {
  initialHistory,
  commit,
  travel,
  canDraw,
  nextNode,
  validate,
  removeSelected,
  renameNode,
  changeWeighted,
} from '../src/app/editor.ts'
import { indexTrace, seek, describeEvent } from '../src/app/playback.ts'
import { compare, WorkerSlot } from '../src/app/protocol.ts'
import { defaults, readPrefs } from '../src/app/settings.ts'
import { search } from '../src/engine/search.ts'
import { parseGraph } from '../src/engine/graph.ts'
import campus from '../examples/campus.json'
const g = validate(campus)
describe('studio graph transactions', () => {
  it('starts empty and assigns a collision-free ID', () => {
    expect(initialHistory().present.graph.nodes).toEqual([])
    expect(nextNode({ ...g, nodes: [{ id: 'N2', x: 1, y: 2 }] }, 3, 4)).toEqual({
      id: 'N3',
      x: 3,
      y: 4,
    })
  })
  it('renames a node atomically across endpoints and edges without changing order', () => {
    const n = renameNode({ ...g, destination: g.start! }, 'Library', { id: 'μ', x: -7, y: 0 })
    expect(validate(n).start).toBe('μ')
    expect(n.destination).toBe('μ')
    expect(n.edges[0]).toEqual({ from: 'μ', to: 'Courtyard', weight: 2 })
    expect(g.nodes[0]!.id).toBe('Library')
  })
  it('removes incident edges and clears only affected endpoints', () => {
    const n = validate(removeSelected(g, { kind: 'node', id: 'Library' }))
    expect(n.start).toBeUndefined()
    expect(n.destination).toBe('Observatory')
    expect(n.edges.length).toBe(3)
  })
  it('removes a selected edge and preserves isolated nodes', () => {
    const n = removeSelected(g, { kind: 'edge', index: 3 })
    expect(n.edges).toEqual(g.edges.filter((_, i) => i !== 3))
    expect(n.nodes).toBe(g.nodes)
  })
  it('rejects duplicate edits, invalid weights and ambiguous direction changes', () => {
    expect(() => validate(renameNode(g, 'Library', { id: 'Garden', x: 1, y: 2 }))).toThrow(
      /Duplicate/,
    )
    for (const edge of [
      { from: 'Workshop', to: 'Garden', weight: 2 },
      { from: 'Garden', to: 'Garden', weight: 1 },
      { from: 'Library', to: 'Garden', weight: Infinity },
    ])
      expect(() => validate({ ...g, edges: [...g.edges, edge] })).toThrow()
  })
  it('round-trips the complete document including extra fields and original edge order', () => {
    const extended = {
      ...g,
      notes: ['retained'],
      nodes: g.nodes.map((n) => ({ ...n, color: 'cyan' })),
    }
    expect(validate(JSON.parse(JSON.stringify(extended)))).toEqual(extended)
  })
  it('undoes and redoes graph replacements, then drops the abandoned future on edit', () => {
    const h = commit(initialHistory(), { name: 'Campus', graph: g }),
      changed = commit(h, { name: 'Campus', graph: validate(changeWeighted(g, false)) })
    expect(travel(changed, true).present).toEqual(h.present)
    expect(travel(travel(changed, true), false).present).toEqual(changed.present)
    expect(commit(travel(changed, true), initialHistory().present).future).toEqual([])
  })
  it('uses a bounded canvas and preserves the full underlying graph', () => {
    const doc = {
      ...g,
      nodes: Array.from({ length: 251 }, (_, i) => ({ id: String(i), x: i, y: 0 })),
      edges: [],
    }
    expect(canDraw(doc)).toBe(false)
    expect(doc.nodes.length).toBe(251)
  })
})
describe('trace and comparison', () => {
  it('projects backward scrubs and reset from actual events', () => {
    const { trace } = search(parseGraph(g), 'dijkstra', { traceLimit: 1000 }),
      index = indexTrace(trace.events, false)
    const expansion = trace.events.findIndex((e) => e.type === 'expanded') + 1
    expect(index.node('Library', expansion)).toBe('visited')
    expect(index.node('Library', expansion - 1)).toBe('frontier')
    expect(index.node('Library', 0)).toBe('')
    expect(index.edge('Workshop', 'Library', trace.events.length)).toBe(true)
    expect(index.edge('Workshop', 'Library', 1)).toBe(false)
    expect(seek(-1, 12)).toBe(0)
    expect(seek(45, 12)).toBe(12)
    expect(describeEvent(trace.events[0]!)).toContain('Library')
  })
  it('never invents a final path for a truncated prefix', () => {
    const r = search(parseGraph(g), 'dijkstra', { traceLimit: 4 })
    expect(r.cost).toBe(5)
    expect(r.trace.truncated).toBe(true)
    expect(indexTrace(r.trace.events, false).edge('Library', 'Workshop', 4)).toBe(false)
  })
  it('compares the identical snapshot with actual costs and independently timed rows', () => {
    const original = JSON.stringify(g),
      rows = compare(g)
    expect(rows.map((r) => ('cost' in r ? r.cost : null))).toEqual([5, 10, 10, 5])
    expect(rows.every((r) => 'ms' in r && r.ms >= 0)).toBe(true)
    expect(JSON.stringify(g)).toBe(original)
  })
  it('reports unsupported weights per row', () => {
    const rows = compare({ ...g, edges: g.edges.map((e) => ({ ...e, weight: -1 })) })
    expect(rows.filter((r) => 'error' in r).map((r) => r.algorithm)).toEqual(['dijkstra', 'astar'])
  })
})
it('validates persisted settings and falls back on invalid storage', () => {
  const storage = (v: string) => ({ getItem: () => v })
  expect(readPrefs(storage('{'))).toEqual(defaults)
  expect(readPrefs(storage('{"theme":"light","speed":4,"grid":false,"snap":"yes"}'))).toEqual({
    ...defaults,
    theme: 'light',
    speed: 4,
    grid: false,
  })
})
it('terminates obsolete worker work and rejects queued stale successes and errors', () => {
  const fake = () => ({
    terminate: vi.fn(),
    postMessage: vi.fn(),
    onmessage: vi.fn(),
    onerror: vi.fn(),
  })
  const old = fake(),
    fresh = fake(),
    done = vi.fn(),
    slot = new WorkerSlot(),
    req = { type: 'compare' as const, graph: g }
  slot.start(old as unknown as Worker, req, done)
  slot.start(fresh as unknown as Worker, req, done)
  expect(old.terminate).toHaveBeenCalledOnce()
  old.onmessage({ data: { type: 'comparison', rows: [] } })
  old.onerror()
  expect(done).not.toHaveBeenCalled()
  fresh.onmessage({ data: { type: 'comparison', rows: [] } })
  expect(done).toHaveBeenCalledOnce()
  expect(fresh.terminate).toHaveBeenCalledOnce()
  slot.start(old as unknown as Worker, req, done)
  slot.cancel()
  old.onmessage({ data: {} })
  expect(done).toHaveBeenCalledTimes(1)
})
