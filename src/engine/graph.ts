export interface GraphNode {
  readonly id: string
  readonly x: number
  readonly y: number
}

export interface EdgeInput {
  readonly from: string
  readonly to: string
  readonly weight?: number
}

export interface GraphDocument {
  readonly directed: boolean
  readonly weighted: boolean
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly EdgeInput[]
  readonly start?: string
  readonly destination?: string
}

export interface Neighbor {
  readonly to: string
  readonly weight: number
}

export interface Graph {
  readonly directed: boolean
  readonly weighted: boolean
  readonly nodes: readonly GraphNode[]
  readonly edgeCount: number
  readonly hasNegativeWeight: boolean
  readonly start: string | undefined
  readonly destination: string | undefined
  node(id: string): GraphNode
  neighbors(id: string): readonly Neighbor[]
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(label + ' must be an object.')
  }
  return value as Record<string, unknown>
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(label + ' must be a finite number.')
  }
  return value
}

export function parseGraph(input: unknown): Graph {
  const doc = record(input, 'Graph')
  const { directed, weighted } = doc
  if (typeof directed !== 'boolean' || typeof weighted !== 'boolean') {
    throw new TypeError('directed and weighted must be booleans.')
  }
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) {
    throw new TypeError('nodes and edges must be arrays.')
  }

  const nodes = new Map<string, GraphNode>()
  const adjacency = new Map<string, Neighbor[]>()
  const targets = new Map<string, Set<string>>()
  for (const raw of doc.nodes) {
    const { id, x, y } = record(raw, 'Node')
    if (typeof id !== 'string' || !id.trim())
      throw new TypeError('Node ID must be a nonblank string.')
    if (nodes.has(id)) throw new Error('Duplicate node: ' + id)
    nodes.set(id, Object.freeze({ id, x: finite(x, 'x'), y: finite(y, 'y') }))
    adjacency.set(id, [])
    targets.set(id, new Set())
  }
  function node(id: unknown): GraphNode {
    const found = typeof id === 'string' && nodes.get(id)
    if (!found) throw new Error('Unknown node ID: ' + String(id))
    return found
  }

  let hasNegativeWeight = false
  for (const raw of doc.edges) {
    const edge = record(raw, 'Edge')
    const from = node(edge.from).id
    const to = node(edge.to).id
    if (from === to) throw new Error('Self-loop: ' + from)
    if (targets.get(from)!.has(to)) throw new Error('Duplicate edge: ' + from + ' → ' + to)
    if (!weighted && 'weight' in edge) throw new Error('Omit weight on unweighted edges.')
    const weight = weighted ? finite(edge.weight, 'weight') : 1
    hasNegativeWeight ||= weight < 0
    targets.get(from)!.add(to)
    adjacency.get(from)!.push(Object.freeze({ to, weight }))
    if (!directed) {
      targets.get(to)!.add(from)
      adjacency.get(to)!.push(Object.freeze({ to: from, weight }))
    }
  }

  for (const list of adjacency.values()) Object.freeze(list)
  return Object.freeze({
    directed,
    weighted,
    hasNegativeWeight,
    nodes: Object.freeze([...nodes.values()]),
    edgeCount: doc.edges.length,
    start: 'start' in doc ? node(doc.start).id : undefined,
    destination: 'destination' in doc ? node(doc.destination).id : undefined,
    node,
    neighbors: (id: string) => adjacency.get(node(id).id)!,
  })
}
