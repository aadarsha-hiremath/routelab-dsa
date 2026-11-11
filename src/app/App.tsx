import { useCallback, useEffect, useRef, useState } from 'react'
import { ReactFlowProvider, useReactFlow, useStore } from '@xyflow/react'
import {
  Workflow,
  PanelsTopLeft,
  Columns3,
  Settings2,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  CirclePlus,
  GitBranch,
  Undo2,
  Redo2,
  FolderOpen,
  Download,
  Upload,
  Trash2,
  Play,
  Pause,
  SkipBack,
  StepForward,
  StepBack,
  Eraser,
  Activity,
  Network,
  FileJson,
  Waypoints,
  X,
  Menu,
} from 'lucide-react'
import campus from '../../examples/campus.json'
import type { GraphDocument, GraphNode } from '../engine/graph.ts'
import type { Algorithm } from '../engine/events.ts'
import { Canvas } from './Canvas.tsx'
import { placeNode } from './placement.ts'
import {
  canDraw,
  changeWeighted,
  commit,
  emptyWorkspace,
  initialHistory,
  MAX_IMPORT_BYTES,
  nextNode,
  removeSelected,
  renameNode,
  travel,
  validate,
} from './editor.ts'
import type { Selection, Workspace } from './editor.ts'
import { algorithms, WorkerSlot } from './protocol.ts'
import type { Request, Reply, Row, Run } from './protocol.ts'
import { seek } from './playback.ts'
import { Comparison, Dialog, EdgeForm, Inspector, NodeField, Settings, Toggle } from './Panels.tsx'
import { defaults, readPrefs, speeds, storageKey } from './settings.ts'
import type { Preferences } from './settings.ts'
import { useRecovery } from './useRecovery.ts'

function Studio() {
  const recovery = useRecovery()
  const { save, locked } = recovery
  const [history, setHistory] = useState(initialHistory),
    { name, graph: g } = history.present
  const [selection, setSelection] = useState<Selection>(null),
    [algorithm, setAlgorithm] = useState<Algorithm>('dijkstra')
  const [prefs, setPrefsState] = useState(() => {
    try {
      return readPrefs(localStorage)
    } catch {
      return defaults
    }
  })
  const [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [run, setRun] = useState<Run | null>(null),
    [rows, setRows] = useState<Row[] | null>(null)
  const [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    [tab, setTab] = useState<'studio' | 'compare'>('studio')
  const [modal, setModal] = useState<'settings' | 'edge' | null>(null),
    [pan, setPan] = useState(false),
    [canvasKey, refit] = useState(0)
  const [mobile, setMobile] = useState<'tools' | 'inspect' | null>(null)
  const worker = useRef(new WorkerSlot()),
    file = useRef<HTMLInputElement>(null)
  const flow = useReactFlow()
  const viewportReady = useStore((s) => s.panZoom !== null && !s.fitViewQueued)
  const total = run?.trace.events.length ?? 0,
    ready = Boolean(g.start && g.destination),
    drawable = canDraw(g)
  useEffect(() => {
    const slot = worker.current
    return () => slot.cancel()
  }, [])
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme =
        prefs.theme === 'system' ? (media.matches ? 'dark' : 'light') : prefs.theme
      document.documentElement.dataset.motion = prefs.motion ? 'reduced' : 'normal'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [prefs.theme, prefs.motion])
  function setPrefs(next: Preferences) {
    setPrefsState(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      setNotice('Preferences apply for this session. Browser storage is unavailable.')
    }
  }
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setStep((s) => seek(s + 1, total)), 350 / prefs.speed)
    return () => clearInterval(id)
  }, [playing, prefs.speed, total])
  useEffect(() => {
    if (step >= total) setPlaying(false)
  }, [step, total])
  const reset = useCallback(() => {
    worker.current.cancel()
    setBusy(false)
    setRun(null)
    setRows(null)
    setPlaying(false)
    setStep(0)
    setNotice('')
  }, [])
  const select = useCallback(
    (s: Selection) =>
      setSelection((old) =>
        old?.kind === 'node' && s?.kind === 'node' && s.id === old.id
          ? old
          : old?.kind === 'edge' && s?.kind === 'edge' && s.index === old.index
            ? old
            : s,
      ),
    [],
  )
  const replace = useCallback(
    (next: Workspace, sel: Selection = null, fit = false, validated = false) => {
      try {
        if (locked) return false
        if (!validated) validate(next.graph)
        reset()
        setHistory((h) => commit(h, next))
        void save(next === emptyWorkspace() ? null : next)
        select(sel)
        if (fit) refit((k) => k + 1)
        return true
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Invalid graph.')
        return false
      }
    },
    [reset, select, locked, save],
  )
  const edit = useCallback(
    (graph: GraphDocument, sel: Selection = selection) => {
      return replace({ name, graph }, sel)
    },
    [name, replace, selection],
  )
  function undo(back: boolean) {
    if (!(back ? history.past : history.future).length) return
    reset()
    select(null)
    const next = travel(history, back)
    setHistory(next)
    void save(next.present === emptyWorkspace() ? null : next.present)
    refit((k) => k + 1)
  }
  const add = useCallback(
    (x?: number, y?: number) => {
      const canvas = document.querySelector('.canvas')
      if (!canvas || !viewportReady) return
      const node = nextNode(g, 0, 0)
      const point = x !== undefined && y !== undefined ? { x, y } : undefined
      const position = placeNode(canvas, flow, g, node.id, prefs.snap, point)
      if (!position) {
        setTab('studio')
        setNotice('No visible space for another node. Pan or zoom out and try again.')
        return
      }
      const n = { ...node, ...position }
      if (
        edit(
          {
            ...g,
            nodes: [...g.nodes, n],
            ...(!g.start ? { start: n.id } : {}),
            ...(g.nodes.length > 0 && !g.destination ? { destination: n.id } : {}),
          },
          { kind: 'node', id: n.id },
        )
      ) {
        setMobile(null)
        setTab('studio')
      }
    },
    [g, flow, prefs.snap, edit, viewportReady],
  )
  const nodeSave = useCallback(
    (id: string, n: GraphNode) => {
      edit(renameNode(g, id, n), { kind: 'node', id: n.id })
    },
    [g, edit],
  )
  const move = useCallback(
    (id: string, x: number, y: number) => {
      const n = g.nodes.find((n) => n.id === id)
      if (n && (n.x !== x || n.y !== y)) nodeSave(id, { ...n, x, y })
    },
    [g.nodes, nodeSave],
  )
  const connect = useCallback(
    (a: string, b: string, w = 1) => {
      const ok = edit(
        { ...g, edges: [...g.edges, { from: a, to: b, ...(g.weighted ? { weight: w } : {}) }] },
        { kind: 'edge', index: g.edges.length },
      )
      if (ok) setModal(null)
      return ok
    },
    [g, edit],
  )
  function remove() {
    if (selection) edit(removeSelected(g, selection), null)
  }
  function endpoint(k: 'start' | 'destination', v: string) {
    const next = { ...g }
    if (v) next[k] = v
    else delete next[k]
    edit(next)
  }
  const sample = useCallback(() => {
    replace({ name: 'Campus paths', graph: campus }, null, true)
    setTab('studio')
    setMobile(null)
  }, [replace])
  function exportFile() {
    const type = { type: 'application/json' }
    const pretty = new Blob([JSON.stringify(g, null, 2)], type)
    const url = URL.createObjectURL(
      pretty.size <= MAX_IMPORT_BYTES ? pretty : new Blob([JSON.stringify(g)], type),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'routelab-graph.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function request(req: Request) {
    worker.current.cancel()
    setNotice('')
    setBusy(true)
    setPlaying(false)
    if (req.type === 'run') {
      setRun(null)
      setStep(0)
    }
    if (req.type === 'compare') setRows(null)
    const complete = (reply: Reply) => {
      setBusy(false)
      if (reply.type === 'error') setNotice(reply.message)
      if (reply.type === 'result') {
        setRun(reply.run)
        setStep(0)
      }
      if (reply.type === 'comparison') setRows(reply.rows)
      if (reply.type === 'imported' && req.type === 'import') {
        replace({ name: req.file.name, graph: reply.graph }, null, true, true)
        setTab('studio')
        setMobile(null)
      }
    }
    try {
      worker.current.start(
        new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' }),
        req,
        complete,
      )
    } catch (e) {
      complete({ type: 'error', message: e instanceof Error ? e.message : 'Worker unavailable.' })
    }
  }
  function navigate(to: number) {
    setPlaying(false)
    setStep(seek(to, total))
  }
  function play() {
    if (!total) return
    if (step === total) setStep(0)
    setPlaying((v) => !v)
  }
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (locked || modal || t.closest('input,select,textarea,[contenteditable=true],dialog'))
        return
      const command = e.ctrlKey || e.metaKey
      if (command && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo(!e.shiftKey)
      } else if (command && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        undo(false)
      } else if (!command && e.key === 'Delete' && selection && tab === 'studio') {
        e.preventDefault()
        remove()
      } else if (
        e.code === 'Space' &&
        total &&
        !t.closest('button,a,summary') &&
        tab === 'studio'
      ) {
        e.preventDefault()
        play()
      } else if (e.key === 'Escape') {
        select(null)
        setMobile(null)
      }
    }
    document.addEventListener('keydown', keys)
    return () => document.removeEventListener('keydown', keys)
  })
  const inspector = (
    <Inspector
      g={g}
      sel={selection}
      algorithm={algorithm}
      run={run}
      step={step}
      busy={busy}
      nodeSave={nodeSave}
      weightSave={(i, w) =>
        edit({ ...g, edges: g.edges.map((e, j) => (i === j ? { ...e, weight: w } : e)) })
      }
      remove={remove}
    />
  )
  return (
    <div className="studio" data-mobile={mobile ?? ''}>
      <header className="top">
        <a
          className="brand"
          href="#studio"
          onClick={(e) => {
            e.preventDefault()
            setTab('studio')
          }}
        >
          <i>
            <Workflow />
          </i>
          Route<span>Lab</span>
        </a>
        <nav aria-label="Workspace view">
          {(
            [
              ['studio', 'Graph studio', PanelsTopLeft],
              ['compare', 'Compare', Columns3],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? 'current' : ''}
              aria-pressed={tab === id}
              onClick={() => {
                setTab(id)
                setMobile(null)
                setPlaying(false)
              }}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <button className="settings-btn" onClick={() => setModal('settings')} aria-label="Settings" title="Open settings">
          <Settings2 />
          <span>Settings</span>
        </button>
      </header>
      <div className="mobile-bar">
        <button onClick={() => setMobile((m) => (m === 'tools' ? null : 'tools'))}>
          <Menu />
          Tools
        </button>
        <button onClick={() => setMobile((m) => (m === 'inspect' ? null : 'inspect'))}>
          <SlidersHorizontal />
          Inspector
        </button>
      </div>
      {recovery.candidate && !recovery.review && (
        <div className="recovery-banner">
          <span>Saved workspace awaiting review.</span>
          <button onClick={() => recovery.setReview(true)}>Review saved workspace</button>
        </div>
      )}
      <main className="workgrid" inert={locked}>
        <aside className="sidebar">
          <h2 className="rail-title">
            <SlidersHorizontal />
            Workspace
          </h2>
          <details open>
            <summary>
              Graph tools
              <ChevronDown />
            </summary>
            <div className="tool-pair">
              <button disabled={!drawable || !viewportReady} onClick={() => add()}>
                <CirclePlus />
                Add node
              </button>
              <button
                disabled={!drawable || g.nodes.length < 2}
                onClick={() => {
                  setNotice('')
                  setModal('edge')
                }}
              >
                <GitBranch />
                Add edge
              </button>
            </div>
            <div className="history">
              <button
                disabled={!history.past.length}
                onClick={() => undo(true)}
                title="Undo (Ctrl+Z)"
              >
                <Undo2 />
                Undo
              </button>
              <button
                disabled={!history.future.length}
                onClick={() => undo(false)}
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 />
                Redo
              </button>
            </div>
          </details>
          <details open>
            <summary>
              Search setup
              <ChevronDown />
            </summary>
            <label>
              Algorithm
              <select
                aria-label="Algorithm"
                value={algorithm}
                onChange={(e) => {
                  reset()
                  setAlgorithm(e.target.value as Algorithm)
                }}
              >
                {(Object.keys(algorithms) as Algorithm[]).map((k) => (
                  <option key={k} value={k}>
                    {algorithms[k].label}
                  </option>
                ))}
              </select>
            </label>
            <div className="end-field start">
              <NodeField
                graph={g}
                label="Start node"
                value={g.start ?? ''}
                onChange={(v) => endpoint('start', v)}
              />
            </div>
            <div className="end-field dest">
              <NodeField
                graph={g}
                label="Destination"
                value={g.destination ?? ''}
                onChange={(v) => endpoint('destination', v)}
              />
            </div>
            <button
              className="primary wide"
              disabled={!ready || busy}
              onClick={() => {
                setTab('studio')
                setMobile(null)
                request({ type: 'run', graph: g, algorithm })
              }}
            >
              <Play />
              Run algorithm
            </button>
          </details>
          <details open>
            <summary>
              Graph options
              <ChevronDown />
            </summary>
            <Toggle
              label="Directed edges"
              value={g.directed}
              change={(directed) => edit({ ...g, directed })}
            />
            <Toggle
              label="Weighted edges"
              value={g.weighted}
              change={(v) => {
                if (
                  !v &&
                  g.edges.some((e) => e.weight !== 1) &&
                  !confirm('Remove all edge weights? Undo restores the original weights.')
                )
                  return
                edit(changeWeighted(g, v))
              }}
            />
          </details>
          <details open>
            <summary>
              Graph files
              <ChevronDown />
            </summary>
            <div className="files">
              <button onClick={() => file.current?.click()}>
                <Upload />
                Import JSON
              </button>
              <button onClick={exportFile}>
                <Download />
                Export JSON
              </button>
              <button onClick={sample}>
                <FolderOpen />
                Load campus example
              </button>
              <button
                disabled={history.present === emptyWorkspace()}
                onClick={() => replace(emptyWorkspace(), null, true)}
              >
                <Trash2 />
                Clear workspace
              </button>
            </div>
          </details>
          {!locked && (
            <input
              ref={file}
              hidden
              type="file"
              accept=".json,application/json"
              aria-label="Import graph file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) request({ type: 'import', file: f })
              }}
            />
          )}
        </aside>
        <section className="center">
          <div className="canvas-head">
            <div>
              <span className="canvas-label">
                <Waypoints />
                Graph canvas
              </span>
              <ChevronRight />
              <h1>{name}</h1>
            </div>
            <span className="counts">
              {g.nodes.length} nodes <b>·</b> {g.edges.length} edges
            </span>
          </div>
          <Canvas
            invalidate={reset}
            key={canvasKey}
            graph={g}
            prefs={prefs}
            events={run?.trace.events}
            step={step}
            selection={selection}
            select={select}
            add={add}
            viewportReady={viewportReady}
            move={move}
            connect={connect}
            example={sample}
            pan={pan}
            setPan={setPan}
          />
          {tab === 'compare' && (
            <Comparison
              rows={rows}
              run={() => request({ type: 'compare', graph: g })}
              enabled={ready}
              busy={busy}
            />
          )}
        </section>
        {inspector}
      </main>
      <footer className="playback">
        <div className="play-title">
          <Activity />
          <div>
            <strong>Playback</strong>
            <small>
              {run?.trace.truncated
                ? 'Partial recording'
                : total
                  ? 'Execution trace'
                  : 'No recording'}
            </small>
          </div>
        </div>
        <div className="transport">
          {(
            [
              ['Restart playback', SkipBack, () => navigate(0), !total],
              ['Step backward', StepBack, () => navigate(step - 1), step === 0],
              [playing ? 'Pause' : 'Play', playing ? Pause : Play, play, !total],
              ['Step forward', StepForward, () => navigate(step + 1), step >= total],
            ] as const
          ).map(([label, Icon, click, disabled], i) => (
            <button
              className={i === 2 ? 'play-button' : 'icon'}
              key={i}
              title={label}
              aria-label={label}
              disabled={disabled}
              onClick={click}
            >
              <Icon />
            </button>
          ))}
        </div>
        <div className="timeline">
          <label htmlFor="timeline">
            Timeline{' '}
            <span>
              Step {step} / {total}
            </span>
          </label>
          <input
            id="timeline"
            type="range"
            min="0"
            max={total || 1}
            disabled={!total}
            value={step}
            onChange={(e) => navigate(Number(e.target.value))}
          />
        </div>
        <select
          className="speed"
          aria-label="Playback speed"
          value={prefs.speed}
          onChange={(e) => setPrefs({ ...prefs, speed: Number(e.target.value) })}
        >
          {speeds.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <button
          className="icon clear-viz"
          disabled={!run}
          aria-label="Clear visualization"
          title="Clear visualization"
          onClick={() => {
            setRun(null)
            navigate(0)
          }}
        >
          <Eraser />
        </button>
      </footer>
      <div className="statusbar">
        <span>
          <i />
          {busy ? 'Working' : ready ? 'Ready to search' : 'Workspace ready'}
        </span>
        <span>
          <Network />
          {g.directed ? 'Directed' : 'Undirected'}
          <b>·</b>
          {g.weighted ? 'Weighted' : 'Unweighted'}
        </span>
        <span role="status" aria-label="Local save status">
          <FileJson />
          {recovery.status}
        </span>
      </div>
      {recovery.error && !recovery.review && (
        <div className="recovery-banner" role="alert">
          <span>{recovery.error}</span>
          {recovery.retry && <button onClick={recovery.retry}>Retry save</button>}
        </div>
      )}
      {recovery.review && recovery.candidate && (
        <Dialog
          title={
            'workspace' in recovery.candidate
              ? 'Restore previous workspace'
              : 'Saved workspace unavailable'
          }
          close={() => recovery.setReview(false)}
        >
          {'workspace' in recovery.candidate ? (
            <p>
              <strong>{recovery.candidate.workspace.name}</strong> ·{' '}
              {recovery.candidate.workspace.graph.nodes.length} nodes ·{' '}
              {recovery.candidate.workspace.graph.edges.length} edges
            </p>
          ) : (
            <p>{recovery.candidate.problem}</p>
          )}
          <p>
            Recovery is local to this browser. Clearing site data can remove saved work. Export JSON
            for a backup or to move it between devices.
          </p>
          {recovery.error && <p role="alert">{recovery.error}</p>}
          <div className="recovery-actions">
            {'workspace' in recovery.candidate && (
              <button
                className="primary"
                disabled={recovery.status === 'Saving'}
                onClick={() => {
                  const workspace = recovery.accept()
                  if (workspace) {
                    reset()
                    setHistory({ past: [], present: workspace, future: [] })
                    refit((k) => k + 1)
                  }
                }}
              >
                Restore workspace
              </button>
            )}
            <button disabled={recovery.status === 'Saving'} onClick={recovery.discard}>
              Discard saved workspace and start empty
            </button>
          </div>
        </Dialog>
      )}
      {notice && (
        <div className="notice" role="alert">
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice('')}>
            <X />
          </button>
        </div>
      )}
      {modal && (
        <Dialog
          title={modal === 'settings' ? 'Studio settings' : 'Create edge'}
          close={() => setModal(null)}
        >
          {modal === 'settings' ? (
            <>
              <Settings prefs={prefs} set={setPrefs} />
              {notice && <p role="alert">{notice}</p>}
            </>
          ) : (
            <>
              <EdgeForm graph={g} save={connect} />
              {notice && <p role="alert">{notice}</p>}
            </>
          )}
        </Dialog>
      )}
    </div>
  )
}
export function App() {
  return (
    <ReactFlowProvider>
      <Studio />
    </ReactFlowProvider>
  )
}
