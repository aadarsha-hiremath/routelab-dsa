import type { Graph, GraphNode } from './graph.ts'
import { MinHeap } from './min-heap.ts'
import { createTrace } from './events.ts'
import type { Algorithm, Status, Trace } from './events.ts'

export interface SearchOptions {
  start?: string
  destination?: string
  traceLimit?: number
  /** A* only. Supply a deterministic, admissible estimate to preserve optimality. */
  heuristic?: (node: GraphNode, destination: GraphNode) => number
}

export interface SearchResult {
  algorithm: Algorithm
  status: Status
  visited: string[]
  expanded: number
  path: string[]
  hops: number | null
  cost: number | null
  trace: Trace
}

interface Parent {
  from: string
  weight: number
}
interface Run {
  graph: Graph
  start: string
  destination: string
  parent: Map<string, Parent>
  trace: ReturnType<typeof createTrace>
  expand(id: string): boolean
}

function sum(a: number, b: number): number {
  const result = a + b
  if (!Number.isFinite(result))
    throw new RangeError('Path cost or priority exceeds the finite number range.')
  return result
}

function enqueue(run: Run, node: string, first: boolean) {
  if (first) run.trace.emit?.({ type: 'discovered', node })
  run.trace.emit?.({ type: 'frontier-added', node })
}

function breadthFirst(run: Run): boolean {
  const queue = [run.start]
  const seen = new Set(queue)
  enqueue(run, run.start, true)
  for (let head = 0; head < queue.length; head++) {
    const from = queue[head]!
    if (run.expand(from)) return true
    for (const { to, weight } of run.graph.neighbors(from)) {
      run.trace.emit?.({ type: 'edge-examined', from, to, weight })
      if (seen.has(to)) continue
      seen.add(to)
      run.parent.set(to, { from, weight })
      queue.push(to)
      enqueue(run, to, true)
    }
  }
  return false
}

function depthFirst(run: Run): boolean {
  // Each frame remembers where recursive DFS would resume its adjacency scan.
  const stack = [{ id: run.start, next: 0 }]
  const seen = new Set([run.start])
  enqueue(run, run.start, true)
  while (stack.length) {
    const frame = stack[stack.length - 1]!
    if (frame.next === 0 && run.expand(frame.id)) return true
    const edge = run.graph.neighbors(frame.id)[frame.next++]
    if (!edge) {
      stack.pop()
      continue
    }
    const { to, weight } = edge
    run.trace.emit?.({ type: 'edge-examined', from: frame.id, to, weight })
    if (seen.has(to)) continue
    seen.add(to)
    run.parent.set(to, { from: frame.id, weight })
    stack.push({ id: to, next: 0 })
    enqueue(run, to, true)
  }
  return false
}

function leastCost(run: Run, heuristic?: SearchOptions['heuristic']): boolean {
  if (run.graph.hasNegativeWeight)
    throw new Error('Cost-based search requires non-negative weights throughout the graph.')
  const goal = run.graph.node(run.destination)
  const estimates = new Map<string, number>()
  function estimate(id: string): number {
    if (!heuristic) return 0
    const cached = estimates.get(id)
    if (cached !== undefined) return cached
    const value = heuristic(run.graph.node(id), goal)
    if (!Number.isFinite(value) || value < 0 || (id === goal.id && value !== 0)) {
      throw new RangeError('Heuristic must be finite, non-negative, and zero at the destination.')
    }
    estimates.set(id, value)
    return value
  }

  estimate(goal.id)
  const scores = new Map([[run.start, 0]])
  const frontier = new MinHeap<{ id: string; cost: number }>()
  frontier.push({ id: run.start, cost: 0 }, estimate(run.start))
  run.trace.emit?.({ type: 'distance-updated', node: run.start, previous: null, cost: 0 })
  enqueue(run, run.start, true)
  while (frontier.size) {
    const { id: from, cost } = frontier.pop()!
    if (scores.get(from) !== cost) continue
    if (run.expand(from)) return true
    for (const { to, weight } of run.graph.neighbors(from)) {
      run.trace.emit?.({ type: 'edge-examined', from, to, weight })
      const candidate = sum(cost, weight)
      const previous = scores.get(to)
      if (previous !== undefined && candidate >= previous) continue
      run.parent.set(to, { from, weight })
      scores.set(to, candidate)
      frontier.push({ id: to, cost: candidate }, sum(candidate, estimate(to)))
      run.trace.emit?.({
        type: 'distance-updated',
        node: to,
        previous: previous ?? null,
        cost: candidate,
      })
      enqueue(run, to, previous === undefined)
    }
  }
  return false
}

export function search(
  graph: Graph,
  algorithm: Algorithm,
  options: SearchOptions = {},
): SearchResult {
  const start = options.start === undefined ? graph.start : options.start
  const destination = options.destination === undefined ? graph.destination : options.destination
  if (start === undefined || destination === undefined)
    throw new Error('Search requires start and destination node IDs.')
  graph.node(start)
  graph.node(destination)
  if (
    options.heuristic !== undefined &&
    (algorithm !== 'astar' || typeof options.heuristic !== 'function')
  ) {
    throw new TypeError('A heuristic function is supported only by A*.')
  }
  const trace = createTrace(options.traceLimit === undefined ? 0 : options.traceLimit)
  const visited: string[] = []
  const parent = new Map<string, Parent>()
  const run: Run = {
    graph,
    start,
    destination,
    parent,
    trace,
    expand(node) {
      visited.push(node)
      trace.emit?.({ type: 'expanded', node })
      if (node !== destination) return false
      trace.emit?.({ type: 'destination-reached', node })
      return true
    },
  }
  trace.emit?.({ type: 'started', algorithm, start, destination })
  let found: boolean
  switch (algorithm) {
    case 'bfs':
      found = breadthFirst(run)
      break
    case 'dfs':
      found = depthFirst(run)
      break
    case 'dijkstra':
      found = leastCost(run)
      break
    case 'astar':
      found = leastCost(run, options.heuristic)
      break
    default:
      throw new TypeError('Unknown search algorithm.')
  }

  const path: string[] = []
  let cost = 0
  if (found) {
    let current = destination
    while (current !== start) {
      path.push(current)
      current = parent.get(current)!.from
    }
    path.push(start)
    path.reverse()
    for (let i = 1; i < path.length; i++) cost = sum(cost, parent.get(path[i]!)!.weight)
    trace.emit?.({ type: 'path-reconstructed', path })
  }
  const status: Status = found ? 'found' : 'unreachable'
  trace.emit?.({ type: 'completed', status })
  return {
    algorithm,
    status,
    visited,
    expanded: visited.length,
    path,
    hops: found ? path.length - 1 : null,
    cost: found ? cost : null,
    trace: trace.result(),
  }
}
