import type { Algorithm, Trace, Status } from '../engine/events.ts'
import type { GraphDocument } from '../engine/graph.ts'
import { parseGraph } from '../engine/graph.ts'
import { search } from '../engine/search.ts'

export const algorithms = {
  dijkstra: {
    label: 'Dijkstra',
    description:
      'Expands the lowest-cost node first. Finds the cheapest route when every edge weight is non-negative.',
    time: 'O(V + E log(E + 2))',
    space: 'O(V + E)',
  },
  bfs: {
    label: 'Breadth-first search',
    description:
      'Uses a queue to visit each layer in order. Minimizes hops, including on unweighted graphs. Edge weights do not influence its route.',
    time: 'O(V + E)',
    space: 'O(V)',
  },
  dfs: {
    label: 'Depth-first search',
    description:
      'Uses a stack to follow each branch deeply. The first route found can have more hops and higher cost.',
    time: 'O(V + E)',
    space: 'O(V)',
  },
  astar: {
    label: 'A* search',
    description:
      'Uses a priority queue and a zero heuristic. This preserves optimality for arbitrary coordinates and non-negative weights.',
    time: 'O(V + E log(E + 2))',
    space: 'O(V + E)',
  },
}
export type Metrics = {
  algorithm: Algorithm
  status: Status
  cost: number | null
  hops: number | null
  expanded: number
}
export type Run = Metrics & { path: readonly string[]; trace: Trace }
export type Row = (Metrics & { ms: number }) | { algorithm: Algorithm; error: string }
export type Request =
  | { type: 'import'; file: File }
  | { type: 'run'; graph: GraphDocument; algorithm: Algorithm }
  | { type: 'compare'; graph: GraphDocument }
export type Reply =
  | { type: 'imported'; graph: GraphDocument }
  | { type: 'result'; run: Run }
  | { type: 'comparison'; rows: Row[] }
  | { type: 'error'; message: string }
export function compare(doc: GraphDocument): Row[] {
  const graph = parseGraph(doc)
  return (Object.keys(algorithms) as Algorithm[]).map((algorithm) => {
    try {
      const begin = performance.now()
      const { status, cost, hops, expanded } = search(graph, algorithm)
      return { algorithm, status, cost, hops, expanded, ms: performance.now() - begin }
    } catch (e) {
      return { algorithm, error: e instanceof Error ? e.message : 'Search failed.' }
    }
  })
}
/** One owner per request. Termination stops CPU work; identity rejects already queued replies. */
export class WorkerSlot {
  private current: Worker | null = null
  cancel() {
    this.current?.terminate()
    this.current = null
  }
  start(worker: Worker, request: Request, done: (reply: Reply) => void) {
    this.cancel()
    this.current = worker
    const finish = (reply: Reply) => {
      if (this.current !== worker) return
      this.cancel()
      done(reply)
    }
    worker.onmessage = ({ data }: MessageEvent<Reply>) => finish(data)
    worker.onerror = () =>
      finish({ type: 'error', message: 'The graph worker stopped. Retry the operation.' })
    worker.postMessage(request)
  }
}
