import { MAX_TRACE_EVENTS } from '../engine/events.ts'
import { parseGraph } from '../engine/graph.ts'
import { search } from '../engine/search.ts'
import { MAX_IMPORT_BYTES, validate } from './editor.ts'
import { compare } from './protocol.ts'
import type { Request, Reply } from './protocol.ts'
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  let reply: Reply
  try {
    if (data.type === 'import') {
      if (data.file.size > MAX_IMPORT_BYTES) throw Error('Choose a JSON file of 2 MiB or less.')
      reply = { type: 'imported', graph: validate(JSON.parse(await data.file.text())) }
    } else if (data.type === 'compare') reply = { type: 'comparison', rows: compare(data.graph) }
    else {
      const { visited: _order, ...run } = search(parseGraph(data.graph), data.algorithm, {
        traceLimit: MAX_TRACE_EVENTS,
      })
      reply = { type: 'result', run }
    }
  } catch (e) {
    reply = { type: 'error', message: e instanceof Error ? e.message : 'Invalid graph.' }
  }
  self.postMessage(reply)
}
