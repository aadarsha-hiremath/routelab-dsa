export type Algorithm = 'bfs' | 'dfs' | 'dijkstra' | 'astar'
export type Status = 'found' | 'unreachable'

export type SearchEvent =
  | { type: 'started'; algorithm: Algorithm; start: string; destination: string }
  | { type: 'discovered'; node: string }
  | { type: 'expanded'; node: string }
  | { type: 'destination-reached'; node: string }
  | { type: 'edge-examined'; from: string; to: string; weight: number }
  | { type: 'distance-updated'; node: string; previous: number | null; cost: number }
  | { type: 'frontier-added'; node: string }
  | { type: 'path-reconstructed'; path: readonly string[] }
  | { type: 'completed'; status: Status }

export interface Trace {
  readonly events: readonly SearchEvent[]
  readonly truncated: boolean
}

export const MAX_TRACE_EVENTS = 10_000

/** Stores a deterministic prefix. A zero limit disables tracing entirely. */
export function createTrace(limit: number) {
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_TRACE_EVENTS) {
    throw new RangeError('Trace limit must be an integer from 0 through ' + MAX_TRACE_EVENTS + '.')
  }
  const events: SearchEvent[] = []
  let truncated = false
  const trace = {
    emit: limit
      ? (event: SearchEvent) => {
          if (events.length < limit) events.push(event)
          else {
            truncated = true
            trace.emit = undefined
          }
        }
      : undefined,
    result: (): Trace => ({ events, truncated }),
  }
  return trace
}
