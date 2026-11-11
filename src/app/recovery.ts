import { validate, type Workspace } from './editor.ts'

export type Candidate = { workspace: Workspace } | { problem: string }

export function decodeRecord(input: unknown): Candidate | null {
  if (input === undefined) return null
  if (!input || typeof input !== 'object' || !('version' in input) || input.version !== 1)
    return { problem: 'The saved workspace format is unsupported.' }
  try {
    if (!('workspace' in input) || !input.workspace || typeof input.workspace !== 'object')
      throw Error()
    const value = input.workspace
    if (!('name' in value) || typeof value.name !== 'string' || !('graph' in value)) throw Error()
    // IndexedDB can represent cycles and BigInts, which the JSON document format cannot.
    JSON.stringify(value.graph)
    return { workspace: { name: value.name, graph: validate(value.graph) } }
  } catch {
    return { problem: 'The saved workspace is damaged and could not be validated.' }
  }
}

export interface RecoveryStore {
  candidate: Candidate | null
  write(workspace: Workspace | null): Promise<void>
  close(): void
}

function connect(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('routelab-recovery', 1)
    let blocked = false
    open.onupgradeneeded = () => open.result.createObjectStore('recovery')
    open.onerror = () => reject(open.error)
    open.onblocked = () => {
      blocked = true
      reject(Error('Close other RouteLab tabs and reload to open local recovery.'))
    }
    open.onsuccess = () => {
      const db = open.result
      db.onversionchange = () => db.close()
      if (blocked) db.close()
      else resolve(db)
    }
  })
}

export async function openRecovery(): Promise<RecoveryStore> {
  const db = await connect()
  try {
    const { record, revision } = await new Promise<{ record: unknown; revision: unknown }>(
      (resolve, reject) => {
        const tx = db.transaction('recovery', 'readonly'),
          store = tx.objectStore('recovery')
        const data = store.get('document'),
          rev = store.get('revision')
        tx.oncomplete = () => resolve({ record: data.result, revision: rev.result })
        tx.onabort = () => reject(tx.error)
      },
    )
    // Revisions survive deletion, so a stale tab cannot resurrect a discarded graph.
    const revisionOf = (v: unknown) =>
      typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : v === undefined ? 0 : -1
    let expected = revisionOf(revision)
    const candidate =
      expected < 0 ? { problem: 'The saved workspace revision is damaged.' } : decodeRecord(record)
    return {
      candidate,
      close: () => db.close(),
      write(workspace) {
        return new Promise<void>((resolve, reject) => {
          // IDB serializes readwrite transactions on this store in creation order.
          const tx = db.transaction('recovery', 'readwrite', { durability: 'strict' })
          const store = tx.objectStore('recovery'),
            read = store.get('revision')
          let failure: unknown
          let next: number
          read.onsuccess = () => {
            try {
              if (revisionOf(read.result) !== expected)
                throw Error(
                  'Another tab changed local recovery. Export your graph and reload before continuing.',
                )
              next = expected + 1
              if (workspace === null) store.delete('document')
              else store.put({ version: 1, workspace }, 'document')
              store.put(next, 'revision')
            } catch (e) {
              failure = e
              tx.abort()
            }
          }
          tx.oncomplete = () => {
            expected = next
            resolve()
          }
          tx.onabort = () =>
            reject(failure ?? tx.error ?? Error('The save transaction was interrupted.'))
        })
      },
    }
  } catch (e) {
    db.close()
    throw e
  }
}
