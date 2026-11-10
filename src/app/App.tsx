import { useEffect, useRef, useState } from 'react'
import type { Algorithm } from '../engine/events.ts'
import type { DisplayResult, Reply, Request, Summary } from './protocol.ts'

const algorithms = {
  bfs: ['Breadth-first search', 'Finds a route with the fewest edges.'],
  dfs: [
    'Depth-first search',
    'Follows one branch at a time. The route can be longer or more expensive.',
  ],
  dijkstra: ['Dijkstra', 'Finds a minimum-cost route with non-negative weights.'],
  astar: [
    'A* search',
    'Uses a zero heuristic for an optimal route on graphs with non-negative weights.',
  ],
} as const

export function App() {
  const worker = useRef<Worker | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [name, setName] = useState('')
  const [algorithm, setAlgorithm] = useState<Algorithm>('dijkstra')
  const [result, setResult] = useState<DisplayResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => () => worker.current?.terminate(), [])

  function clear() {
    worker.current?.terminate()
    worker.current = null
    setName('')
    setSummary(null)
    setAlgorithm('dijkstra')
    setResult(null)
    setError('')
    setBusy(false)
  }

  function load(file?: File) {
    clear()
    setName(file?.name ?? 'Campus paths')
    setBusy(true)
    const session = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
    worker.current = session
    session.onmessage = ({ data }: MessageEvent<Reply>) => {
      if (worker.current !== session) return
      setBusy(false)
      if (data.type === 'loaded') setSummary(data.summary)
      if (data.type === 'result') setResult(data.result)
      if (data.type === 'error') setError(data.message)
    }
    session.onerror = () => {
      if (worker.current !== session) return
      clear()
      setError('The graph worker stopped. Open the graph again to retry.')
    }
    const request: Request = file ? { type: 'load', file } : { type: 'load' }
    session.postMessage(request)
  }

  function run() {
    setBusy(true)
    setError('')
    setResult(null)
    worker.current?.postMessage({ type: 'run', algorithm } satisfies Request)
  }

  return (
    <>
      <header>
        <div className="wrap masthead">
          <span className="mark" aria-hidden="true">
            R
          </span>
          <strong>RouteLab</strong>
        </div>
      </header>
      <main className="wrap">
        <h1>Graph workspace</h1>
        <p className="intro">
          Explore how four search algorithms traverse a graph and choose a route between two nodes.
        </p>
        <section aria-labelledby="workspace-title" className="panel">
          <div className="panel-heading">
            <h2 id="workspace-title">{summary ? name : 'Open a graph'}</h2>
            {summary && (
              <button className="link" onClick={clear}>
                Clear workspace
              </button>
            )}
          </div>
          {summary ? (
            <>
              <p className="subtle">
                {summary.nodes} nodes · {summary.edges} edges
              </p>
              <div className="endpoints">
                <div>
                  <span>Start</span>
                  <strong>{summary.start}</strong>
                </div>
                <div>
                  <span>Destination</span>
                  <strong>{summary.destination}</strong>
                </div>
              </div>
              <label htmlFor="algorithm">Algorithm</label>
              <div className="actions">
                <select
                  id="algorithm"
                  value={algorithm}
                  disabled={busy}
                  onChange={(e) => {
                    setAlgorithm(e.target.value as Algorithm)
                    setResult(null)
                    setError('')
                  }}
                >
                  {(Object.keys(algorithms) as Algorithm[]).map((id) => (
                    <option key={id} value={id}>
                      {algorithms[id][0]}
                    </option>
                  ))}
                </select>
                <button className="primary" onClick={run} disabled={busy}>
                  Run search
                </button>
              </div>
              <p className="hint">{algorithms[algorithm][1]}</p>
            </>
          ) : (
            <>
              <p className="subtle">
                Your workspace is empty. Open a local JSON file or explore the campus example.
              </p>
              <div className="actions">
                <button className="primary" onClick={() => picker.current?.click()}>
                  Open JSON file
                </button>
                <button onClick={() => load()}>Load example</button>
              </div>
              <input
                ref={picker}
                type="file"
                hidden
                accept=".json,application/json"
                aria-label="Graph JSON file"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) load(file)
                }}
              />
            </>
          )}
          <div role="status">
            {busy && <p>{summary ? 'Running search…' : 'Reading graph…'}</p>}
            {result && (
              <div className="result">
                <h3>{result.status === 'found' ? 'Route found' : 'Destination unreachable'}</h3>
                {result.status === 'found' && (
                  <p className="route">
                    {result.path
                      .map(
                        (id, i) =>
                          (i > 0
                            ? result.omitted > 0 && i === 10
                              ? ' → … (' + result.omitted + ' omitted) → '
                              : ' → '
                            : '') + id,
                      )
                      .join('')}
                  </p>
                )}
                <dl>
                  {[
                    ['Expanded', result.expanded],
                    ['Edges in route', result.hops],
                    ['Path cost', result.cost],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
        <details>
          <summary>Graph file format</summary>
          <p>
            Use a JSON object with boolean <code>directed</code> and <code>weighted</code> flags.
            Give each node a unique string <code>id</code> and numeric <code>x</code> and{' '}
            <code>y</code> coordinates. Edges specify <code>from</code> and <code>to</code>. Include
            a numeric <code>weight</code> only for weighted graphs. Set <code>start</code> and{' '}
            <code>destination</code> to node IDs. Files up to 2 MiB are processed in your browser.
          </p>
          <a
            href={new URL('../../examples/campus.json', import.meta.url).href}
            download="campus.json"
          >
            Download example JSON
          </a>
        </details>
      </main>
    </>
  )
}
