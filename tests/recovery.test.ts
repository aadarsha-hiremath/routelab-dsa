import { expect, it } from 'vitest'
import { decodeRecord } from '../src/app/recovery.ts'
import { emptyWorkspace, commit, initialHistory, travel } from '../src/app/editor.ts'
import campus from '../examples/campus.json'

it('startup distinguishes an absent record from corrupt or unknown data', () => {
  expect(decodeRecord(undefined)).toBeNull()
  const cycle = { metadata: {} }
  cycle.metadata = cycle
  expect(
    decodeRecord({
      version: 1,
      workspace: { name: 'bad metadata', graph: { ...campus, ...cycle } },
    }),
  ).toHaveProperty('problem')
  for (const record of [
    null,
    {},
    { version: 2, workspace: { name: 'future', graph: campus } },
    { version: 1, workspace: { name: 'bad', graph: { ...campus, start: 'missing' } } },
    { version: 1, workspace: { name: 2, graph: campus } },
  ])
    expect(decodeRecord(record)).toHaveProperty('problem')
})
it('recovers validated graph metadata and names without exposing other stored state', () => {
  const workspace = { name: 'Study map', graph: { ...campus, metadata: { topic: 'routes' } } }
  expect(
    decodeRecord({ version: 1, workspace: { ...workspace, trace: [1, 2], history: [] } }),
  ).toEqual({ workspace })
})
it('recognizes clear and undo to pristine without discarding an intentionally named empty file', () => {
  const imported = { ...emptyWorkspace(), name: 'blank.json' }
  const h = commit(initialHistory(), imported)
  expect(h.present).not.toBe(emptyWorkspace())
  expect(travel(h, true).present).toBe(emptyWorkspace())
  expect(travel(commit(h, emptyWorkspace()), true).present).toBe(imported)
})
