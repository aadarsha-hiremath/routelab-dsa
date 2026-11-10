import sample from '../../examples/campus.json'
import { parseGraph } from '../engine/graph.ts'
import type { Graph } from '../engine/graph.ts'
import { search } from '../engine/search.ts'
import type { Request, Reply } from './protocol.ts'

let graph: Graph | undefined
function reply(message: Reply) {
  self.postMessage(message)
}

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === 'load') {
      graph = undefined
      if (data.file && data.file.size > 2 * 1024 * 1024)
        throw new Error('Choose a JSON file of 2 MiB or less.')
      const input: unknown = data.file ? JSON.parse(await data.file.text()) : sample
      const next = parseGraph(input)
      if (!next.start || !next.destination)
        throw new Error('Include start and destination node IDs to run this graph.')
      graph = next
      reply({
        type: 'loaded',
        summary: {
          nodes: next.nodes.length,
          edges: next.edgeCount,
          start: next.start,
          destination: next.destination,
        },
      })
    } else {
      if (!graph) throw new Error('Open a graph first.')
      const { status, cost, hops, expanded, path } = search(graph, data.algorithm)
      const omitted = Math.max(0, path.length - 20)
      reply({
        type: 'result',
        result: {
          status,
          cost,
          hops,
          expanded,
          omitted,
          path: omitted ? [...path.slice(0, 10), ...path.slice(-10)] : path,
        },
      })
    }
  } catch (error) {
    reply({
      type: 'error',
      message: error instanceof Error ? error.message : 'Could not process the graph.',
    })
  }
}
