import type { Algorithm } from '../engine/events.ts'

export interface Summary {
  nodes: number
  edges: number
  start: string
  destination: string
}

export interface DisplayResult {
  status: 'found' | 'unreachable'
  cost: number | null
  hops: number | null
  expanded: number
  path: string[]
  omitted: number
}

export type Request = { type: 'load'; file?: File } | { type: 'run'; algorithm: Algorithm }

export type Reply =
  | { type: 'loaded'; summary: Summary }
  | { type: 'result'; result: DisplayResult }
  | { type: 'error'; message: string }
