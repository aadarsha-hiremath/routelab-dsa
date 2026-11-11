import { memo, useLayoutEffect, useRef } from 'react'
import type { ReactNode, FormEvent } from 'react'
import {
  X,
  SlidersHorizontal,
  Scan,
  Route,
  BookOpen,
  Terminal,
  ChevronRight,
  Trash2,
  GitBranch,
} from 'lucide-react'
import { algorithms } from './protocol.ts'
import type { Run, Row } from './protocol.ts'
import type { Algorithm } from '../engine/events.ts'
import type { GraphDocument, GraphNode } from '../engine/graph.ts'
import type { Selection } from './editor.ts'
import { firstUnusedEdge } from './editor.ts'
import { describeEvent } from './playback.ts'
import type { Preferences } from './settings.ts'
import { speeds, defaults } from './settings.ts'

export function Dialog({
  title,
  close,
  children,
}: {
  title: string
  close: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const d = ref.current!
    const opener = document.activeElement
    d.showModal()
    return () => {
      d.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])
  return (
    <dialog ref={ref} onCancel={close} aria-label={title}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon" aria-label="Close dialog" onClick={close}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function Toggle({
  label,
  value,
  change,
}: {
  label: string
  value: boolean
  change: (v: boolean) => void
}) {
  return (
    <label className="toggle">
      {label}
      <input type="checkbox" checked={value} onChange={(e) => change(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  )
}
export function Settings({ prefs, set }: { prefs: Preferences; set: (p: Preferences) => void }) {
  return (
    <div className="settings">
      <label>
        Theme
        <select
          aria-label="Theme"
          value={prefs.theme}
          onChange={(e) => set({ ...prefs, theme: e.target.value as Preferences['theme'] })}
        >
          {['dark', 'light', 'system'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Playback speed
        <select
          aria-label="Playback speed"
          value={prefs.speed}
          onChange={(e) => set({ ...prefs, speed: Number(e.target.value) })}
        >
          {speeds.map((v) => (
            <option value={v} key={v}>
              {v}×
            </option>
          ))}
        </select>
      </label>
      {(
        [
          ['motion', 'Reduce motion'],
          ['grid', 'Canvas grid'],
          ['snap', 'Snap to grid'],
          ['minimap', 'Show minimap'],
        ] as const
      ).map(([k, label]) => (
        <Toggle key={k} label={label} value={prefs[k]} change={(v) => set({ ...prefs, [k]: v })} />
      ))}
      <button onClick={() => set({ ...defaults })}>Reset preferences</button>
    </div>
  )
}
export function NodeField({
  graph,
  label,
  value,
  onChange,
}: {
  graph: GraphDocument
  label: string
  value: string
  onChange: (s: string) => void
}) {
  return (
    <label>
      {label}
      {graph.nodes.length <= 250 ? (
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!graph.nodes.length}
        >
          <option value="">Choose node</option>
          {graph.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.id}
            </option>
          ))}
        </select>
      ) : (
        <input
          key={value}
          defaultValue={value}
          placeholder="Exact node ID"
          onBlur={(e) => {
            if (e.target.value !== value) {
              onChange(e.target.value)
              e.target.value = value
            }
          }}
        />
      )}
    </label>
  )
}
export function EdgeForm({
  graph,
  save,
}: {
  graph: GraphDocument
  save: (from: string, to: string, w: number) => void
}) {
  const pair = firstUnusedEdge(graph)
  if (!pair)
    return (
      <>
        <p>
          Every available node pair is connected. Add a node or remove an edge to create another
          connection.
        </p>
        <button className="primary" disabled>
          Create edge
        </button>
      </>
    )
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        save(String(f.get('from')), String(f.get('to')), Number(f.get('weight') ?? 1))
      }}
    >
      {(['from', 'to'] as const).map((k, i) => (
        <label key={k}>
          {i ? 'To node' : 'From node'}
          <select name={k} defaultValue={pair[k]}>
            {graph.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id}
              </option>
            ))}
          </select>
        </label>
      ))}
      {graph.weighted && (
        <label>
          Edge weight
          <input name="weight" type="number" step="any" required defaultValue="1" />
        </label>
      )}
      <button className="primary">Create edge</button>
    </form>
  )
}
type InspectorProps = {
  g: GraphDocument
  sel: Selection
  algorithm: Algorithm
  run: Run | null
  step: number
  busy: boolean
  nodeSave: (id: string, n: GraphNode) => void
  weightSave: (index: number, w: number) => void
  remove: () => void
}
const FinalPath = memo(function FinalPath({ path }: { path: readonly string[] }) {
  return (
    <details className="path-details" open={path.length <= 20}>
      <summary>Final path · {path.length} nodes</summary>
      <p>{path.join(' → ')}</p>
    </details>
  )
})
export function Inspector({
  g,
  sel,
  algorithm,
  run,
  step,
  busy,
  nodeSave,
  weightSave,
  remove,
}: InspectorProps) {
  const node = sel?.kind === 'node' ? g.nodes.find((n) => n.id === sel.id) : undefined
  const edge = sel?.kind === 'edge' ? g.edges[sel.index] : undefined
  const info = algorithms[algorithm]
  function saveNode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (node)
      nodeSave(node.id, { id: String(f.get('id')), x: Number(f.get('x')), y: Number(f.get('y')) })
  }
  const events = run?.trace.events ?? []
  return (
    <aside className="inspector">
      <h2 className="rail-title">
        <SlidersHorizontal />
        Inspector
      </h2>
      <section>
        <h3>Selection</h3>
        {node ? (
          <form key={JSON.stringify(node)} onSubmit={saveNode}>
            <label>
              Node ID
              <input name="id" defaultValue={node.id} required />
            </label>
            <div className="pair">
              {(['x', 'y'] as const).map((k) => (
                <label key={k}>
                  {k.toUpperCase()}
                  <input name={k} type="number" step="any" defaultValue={node[k]} required />
                </label>
              ))}
            </div>
            <div className="pair">
              <button>Apply node</button>
              <button type="button" onClick={remove}>
                <Trash2 />
                Delete
              </button>
            </div>
          </form>
        ) : edge && sel?.kind === 'edge' ? (
          <form
            key={JSON.stringify(edge)}
            onSubmit={(e) => {
              e.preventDefault()
              weightSave(sel.index, Number(new FormData(e.currentTarget).get('weight')))
            }}
          >
            <p>
              {edge.from} → {edge.to}
            </p>
            {g.weighted && (
              <>
                <label>
                  Weight
                  <input
                    name="weight"
                    type="number"
                    step="any"
                    defaultValue={edge.weight}
                    required
                  />
                </label>
                <button>Apply weight</button>
              </>
            )}
            <button type="button" onClick={remove}>
              <Trash2 />
              Delete edge
            </button>
          </form>
        ) : (
          <div className="selection-empty">
            <Scan />
            <span>Select a node or edge to inspect its properties.</span>
          </div>
        )}
      </section>
      <section>
        <h3>
          <Route />
          Search result
        </h3>
        {run ? (
          <>
            <strong className="result-status">
              {run.status === 'found' ? 'Route found' : 'Destination unreachable'}
            </strong>
            {run.path.length > 0 && <FinalPath path={run.path} />}
            <dl className="metrics">
              {[
                ['Path cost', run.cost],
                ['Hops', run.hops],
                ['Expanded nodes', run.expanded],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="muted">
            {busy ? 'Worker active…' : 'Run a search to inspect its route and metrics.'}
          </p>
        )}
      </section>
      <section>
        <h3>
          <BookOpen />
          Algorithm guide
        </h3>
        <div className="guide">
          <strong>
            <GitBranch />
            {info.label}
          </strong>
          <p>{info.description}</p>
          <dl className="metrics">
            <div>
              <dt>Time</dt>
              <dd>{info.time}</dd>
            </div>
            <div>
              <dt>Space</dt>
              <dd>{info.space}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section>
        <h3>
          <Terminal />
          Execution log
        </h3>
        {run?.trace.truncated && (
          <p className="warning">
            Partial playback · first {events.length.toLocaleString()} events. Results cover the full
            search.
          </p>
        )}
        {step === 0 ? (
          <p className="muted">
            {events.length
              ? 'Step forward or play to follow the trace.'
              : 'Recorded steps appear here after a search.'}
          </p>
        ) : (
          <ol className="log" start={Math.max(1, step - 3)}>
            {events.slice(Math.max(0, step - 4), step).map((e, i) => (
              <li key={i}>{describeEvent(e)}</li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  )
}
export function Comparison({
  rows,
  run,
  enabled,
  busy,
}: {
  rows: Row[] | null
  run: () => void
  enabled: boolean
  busy: boolean
}) {
  return (
    <div className="comparison">
      <div className="comparison-heading">
        <h2>Algorithm comparison</h2>
        <button className="primary" disabled={!enabled || busy} onClick={run}>
          <ChevronRight />
          Compare all four
        </button>
      </div>
      <p>
        Run all four algorithms on the same graph. Times measure one worker search per algorithm,
        with tracing off. Short runs can fall below timer resolution.
      </p>
      {rows ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {['Algorithm', 'Status', 'Cost', 'Hops', 'Expanded', 'Time (ms)'].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.algorithm}>
                  <th>{algorithms[r.algorithm].label}</th>
                  {'error' in r ? (
                    <td colSpan={5}>{r.error}</td>
                  ) : (
                    <>
                      <td>{r.status}</td>
                      <td>{r.cost ?? '—'}</td>
                      <td>{r.hops ?? '—'}</td>
                      <td>{r.expanded}</td>
                      <td>{r.ms.toFixed(3)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="comparison-empty">
          {enabled
            ? 'Ready to compare this graph.'
            : 'Add a graph and choose both endpoints to compare searches.'}
        </p>
      )}
      <p>
        BFS minimizes hop count. DFS follows the first reachable branch and can return a higher-cost
        route.
      </p>
    </div>
  )
}
