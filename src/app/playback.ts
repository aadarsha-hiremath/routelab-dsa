import type { SearchEvent } from '../engine/events.ts'
type Mark = 'discovered' | 'frontier' | 'visited' | 'path'
type Change = { step: number; mark: Mark }
export function edgeKey(a: string, b: string, directed: boolean) {
  return JSON.stringify(!directed && b < a ? [b, a] : [a, b])
}
/** Index once. Scrubbing never replays the whole prefix or copies frame snapshots. */
export function indexTrace(events: readonly SearchEvent[], directed: boolean) {
  const changes = new Map<string, Change[]>(),
    pathEdges = new Map<string, number>()
  function mark(id: string, step: number, value: Mark) {
    const entries = changes.get(id) ?? []
    entries.push({ step, mark: value })
    changes.set(id, entries)
  }
  events.forEach((e, i) => {
    const step = i + 1
    if (e.type === 'discovered') mark(e.node, step, 'discovered')
    if (e.type === 'frontier-added') mark(e.node, step, 'frontier')
    if (e.type === 'expanded') mark(e.node, step, 'visited')
    if (e.type === 'path-reconstructed')
      e.path.forEach((id, j) => {
        mark(id, step, 'path')
        if (j) pathEdges.set(edgeKey(e.path[j - 1]!, id, directed), step)
      })
  })
  return {
    node(id: string, step: number) {
      const arr = changes.get(id)
      if (!arr) return ''
      let lo = 0,
        hi = arr.length
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (arr[mid]!.step <= step) lo = mid + 1
        else hi = mid
      }
      return arr[lo - 1]?.mark ?? ''
    },
    edge(a: string, b: string, step: number) {
      return (pathEdges.get(edgeKey(a, b, directed)) ?? Infinity) <= step
    },
  }
}
export const seek = (step: number, total: number) => Math.max(0, Math.min(total, Math.round(step)))
export function describeEvent(e: SearchEvent): string {
  switch (e.type) {
    case 'started':
      return 'Search started · ' + e.start + ' → ' + e.destination
    case 'discovered':
      return 'Discovered ' + e.node
    case 'expanded':
      return 'Expanded ' + e.node
    case 'frontier-added':
      return 'Added ' + e.node + ' to frontier'
    case 'edge-examined':
      return 'Examined ' + e.from + ' → ' + e.to + ' · weight ' + e.weight
    case 'distance-updated':
      return 'Distance to ' + e.node + ' = ' + e.cost
    case 'destination-reached':
      return 'Reached destination ' + e.node
    case 'path-reconstructed':
      return 'Reconstructed route · ' + (e.path.length - 1) + ' hops'
    case 'completed':
      return 'Search complete · ' + e.status
  }
}
