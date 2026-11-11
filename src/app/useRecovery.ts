import { useCallback, useEffect, useRef, useState } from 'react'
import { openRecovery, type Candidate, type RecoveryStore } from './recovery.ts'
import type { Workspace } from './editor.ts'

type Status =
  | 'Checking local recovery'
  | 'Local workspace'
  | 'Recovery available'
  | 'Saving'
  | 'Saved locally'
  | 'Save failed'

export function useRecovery() {
  const store = useRef<RecoveryStore | null>(null)
  const sequence = useRef(0),
    dirty = useRef(false)
  const [status, setStatus] = useState<Status>('Checking local recovery')
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [review, setReview] = useState(false)
  const [error, setError] = useState('')
  const latest = useRef<Workspace | null>(null)

  useEffect(() => {
    let active = true
    openRecovery()
      .then((connection) => {
        if (!active) {
          connection.close()
          return
        }
        store.current = connection
        setCandidate(connection.candidate)
        setReview(!!connection.candidate)
        setStatus(connection.candidate ? 'Recovery available' : 'Local workspace')
      })
      .catch(() => {
        if (active) {
          setStatus('Save failed')
          setError('Local recovery could not be opened. Export your work before closing this tab.')
        }
      })
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', guard)
    return () => {
      active = false
      sequence.current++
      store.current?.close()
      store.current = null
      window.removeEventListener('beforeunload', guard)
    }
  }, [])
  const save = useCallback(async (workspace: Workspace | null) => {
    latest.current = workspace
    dirty.current = true
    const id = ++sequence.current
    if (!store.current) return false
    setError('')
    setStatus('Saving')
    try {
      await store.current.write(workspace)
      if (sequence.current !== id) return false
      dirty.current = false
      setStatus('Saved locally')
      return true
    } catch (e) {
      if (sequence.current === id) {
        setStatus('Save failed')
        setError(
          (e instanceof Error ? e.message : 'Local storage is unavailable.') +
            ' The previous recovery copy may remain. Export your work or retry.',
        )
      }
      return false
    }
  }, [])
  function accept() {
    if (!candidate || !('workspace' in candidate)) return null
    dirty.current = false
    setError('')
    setCandidate(null)
    setReview(false)
    setStatus('Saved locally')
    return candidate.workspace
  }
  async function discard() {
    if (await save(null)) {
      setCandidate(null)
      setReview(false)
      setStatus('Local workspace')
    }
  }
  return {
    status,
    error,
    candidate,
    review,
    setReview,
    save,
    accept,
    discard,
    locked: status === 'Checking local recovery' || candidate !== null,
    retry: store.current && !candidate ? () => save(latest.current) : null,
  }
}
