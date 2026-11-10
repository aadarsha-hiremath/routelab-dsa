import { memo, useCallback, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  BackgroundVariant,
} from '@xyflow/react'
import type { Node, Edge, NodeProps, NodeChange, Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Maximize,
  Minus,
  Plus,
  Network,
  MousePointer2,
  Hand,
  Layers3,
  FolderOpen,
} from 'lucide-react'
import type { GraphDocument } from '../engine/graph.ts'
import type { SearchEvent } from '../engine/events.ts'
import type { Selection } from './editor.ts'
import { canDraw } from './editor.ts'
import { snapGrid } from './placement.ts'
import type { Preferences } from './settings.ts'
import { edgeKey, indexTrace } from './playback.ts'

type Vertex = Node<{ label: string; role: string; mark: string }, 'vertex'>
const VertexView = memo(function VertexView({ data, selected }: NodeProps<Vertex>) {
  return (
    <div className={'vertex ' + data.mark + (selected ? ' chosen' : '')} title={data.label}>
      <Handle type="target" position={Position.Left} />
      <i />
      {data.label}
      {data.role && (
        <small
          className={data.role.includes('S') ? 'start-role' : 'destination-role'}
          title={
            data.role === 'S/D'
              ? 'Start and destination'
              : data.role === 'S'
                ? 'Start node'
                : 'Destination node'
          }
        >
          {data.role}
        </small>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
})
const types = { vertex: VertexView }
const emptyEvents: readonly SearchEvent[] = []
const fitOptions = { padding: 0.22, maxZoom: 1.15 }
type Props = {
  graph: GraphDocument
  prefs: Preferences
  selection: Selection
  events?: readonly SearchEvent[] | undefined
  step: number
  invalidate: () => void
  select: (s: Selection) => void
  add: (x?: number, y?: number) => void
  viewportReady: boolean
  connect: (a: string, b: string) => void
  move: (id: string, x: number, y: number) => void
  example: () => void
  pan: boolean
  setPan: (v: boolean) => void
}
export const Canvas = memo(function Canvas({
  graph,
  prefs,
  selection,
  events = emptyEvents,
  step,
  select,
  add,
  viewportReady,
  connect,
  move,
  example,
  pan,
  setPan,
  invalidate,
}: Props) {
  const flow = useReactFlow<Vertex>()
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const [sizes, setSizes] = useState<Map<string, { width: number; height: number }>>(
    () => new Map(),
  )
  const drawable = canDraw(graph)
  const timeline = useMemo(() => indexTrace(events, graph.directed), [events, graph.directed])
  const ids = useMemo(
    () => new Map(drawable ? graph.nodes.map((n, i) => [n.id, 'n' + i]) : []),
    [graph.nodes, drawable],
  )
  const previous = useRef(new Map<string, Vertex>())
  const nodes = useMemo(() => {
    const cache = new Map<string, Vertex>()
    if (drawable)
      graph.nodes.forEach((n, i) => {
        const id = 'n' + i,
          mark = timeline.node(n.id, step)
        const role = [graph.start === n.id ? 'S' : '', graph.destination === n.id ? 'D' : '']
          .filter(Boolean)
          .join('/')
        const selected = selection?.kind === 'node' && selection.id === n.id
        const pos = drag?.id === id ? drag : n,
          old = previous.current.get(id)
        const measured = sizes.get(id)
        cache.set(
          id,
          old &&
            old.measured === measured &&
            old.position.x === pos.x &&
            old.position.y === pos.y &&
            old.data.label === n.id &&
            old.data.role === role &&
            old.data.mark === mark &&
            old.selected === selected
            ? old
            : {
                id,
                type: 'vertex',
                ...(measured ? { measured } : {}),
                position: { x: pos.x, y: pos.y },
                data: { label: n.id, role, mark },
                selected,
                ariaLabel: 'Node ' + n.id,
              },
        )
      })
    previous.current = cache
    return [...cache.values()]
  }, [
    graph.nodes,
    graph.start,
    graph.destination,
    selection,
    drag,
    timeline,
    step,
    drawable,
    sizes,
  ])
  const baseEdges = useMemo<Edge[]>(
    () =>
      drawable
        ? graph.edges.map((e, i) => ({
            id: 'e' + i,
            source: ids.get(e.from)!,
            target: ids.get(e.to)!,
            type: 'default',
            label: graph.weighted ? String(e.weight) : '',
            interactionWidth: 24,
            ...(graph.directed ? { markerEnd: { type: MarkerType.ArrowClosed } } : {}),
            ariaLabel: 'Edge ' + e.from + ' to ' + e.to,
          }))
        : [],
    [graph.edges, graph.weighted, graph.directed, ids, drawable],
  )
  const event = events[step - 1]
  const edges = useMemo(
    () =>
      baseEdges.map((edge, i) => {
        const e = graph.edges[i]!,
          match =
            event?.type === 'edge-examined' &&
            edgeKey(e.from, e.to, graph.directed) === edgeKey(event.from, event.to, graph.directed)
        const selected = selection?.kind === 'edge' && selection.index === i
        const mark = timeline.edge(e.from, e.to, step) ? 'path' : match ? 'examined' : ''
        return mark || selected ? { ...edge, className: mark, selected } : edge
      }),
    [baseEdges, event, selection, graph.edges, graph.directed, timeline, step],
  )
  const change = useCallback(
    (changes: NodeChange<Vertex>[]) => {
      const dimensions = changes.filter((c) => c.type === 'dimensions' && c.dimensions)
      if (dimensions.length)
        setSizes((old) => {
          const next = new Map(old)
          for (const c of dimensions)
            if (c.type === 'dimensions' && c.dimensions) {
              const prev = old.get(c.id)
              if (prev?.width !== c.dimensions.width || prev.height !== c.dimensions.height)
                next.set(c.id, c.dimensions)
            }
          return next.size === old.size &&
            dimensions.every((c) => 'id' in c && next.get(c.id) === old.get(c.id))
            ? old
            : next
        })
      for (const c of changes)
        if (c.type === 'position' && c.position) {
          if (c.dragging) setDrag({ id: c.id, ...c.position })
          else if (c.dragging === undefined) {
            const n = graph.nodes[Number(c.id.slice(1))]
            if (n) move(n.id, c.position.x, c.position.y)
          }
        }
    },
    [graph.nodes, move],
  )
  const link = useCallback(
    (c: Connection) => {
      if (c.source && c.target)
        connect(
          graph.nodes[Number(c.source.slice(1))]!.id,
          graph.nodes[Number(c.target.slice(1))]!.id,
        )
    },
    [graph.nodes, connect],
  )
  return (
    <div
      className="canvas"
      data-testid="canvas"
      onKeyDownCapture={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        const group = (e.target as Element).closest<HTMLElement>(
          '.react-flow__node,.react-flow__edge',
        )
        const id = group?.dataset.id
        if (!id) return
        e.preventDefault()
        e.stopPropagation()
        const i = Number(id.slice(1))
        select(
          id[0] === 'n' ? { kind: 'node', id: graph.nodes[i]!.id } : { kind: 'edge', index: i },
        )
      }}
      onDoubleClick={(e) => {
        if (drawable && (e.target as Element).classList.contains('react-flow__pane')) {
          const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
          add(p.x, p.y)
        }
      }}
    >
      {drawable ? (
        <ReactFlow<Vertex>
          nodes={nodes}
          edges={edges}
          nodeTypes={types}
          onNodesChange={change}
          onConnect={link}
          onNodeDragStart={invalidate}
          onNodeDragStop={(_, n) => {
            setDrag(null)
            move(n.data.label, n.position.x, n.position.y)
          }}
          onNodeClick={(_, n) => select({ kind: 'node', id: n.data.label })}
          onEdgeClick={(_, e) => select({ kind: 'edge', index: Number(e.id.slice(1)) })}
          onPaneClick={() => select(null)}
          onMoveEnd={(_, v) => setZoom(v.zoom)}
          nodesDraggable={!pan}
          nodesConnectable={!pan}
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
          zoomOnDoubleClick={false}
          snapToGrid={prefs.snap}
          snapGrid={snapGrid}
          fitView={graph.nodes.length > 0}
          fitViewOptions={fitOptions}
          minZoom={0.08}
          maxZoom={3}
          panOnDrag={pan ? true : [0, 1, 2]}
          onlyRenderVisibleElements={nodes.length > 100}
          proOptions={{ hideAttribution: false }}
        >
          {prefs.grid && (
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.25} color="var(--dot)" />
          )}
          {prefs.minimap && nodes.length > 0 && (
            <MiniMap
              style={{ width: 120, height: 80 }}
              zoomable
              pannable
              ariaLabel="Graph minimap"
              nodeColor="var(--cyan)"
              maskColor="var(--mask)"
            />
          )}
        </ReactFlow>
      ) : (
        <div className="empty">
          <Layers3 />
          <h2>Graph overview mode</h2>
          <p>
            This graph exceeds the canvas limit of 250 nodes or 500 edges. Run searches, compare
            results, or export the complete graph.
          </p>
        </div>
      )}
      {drawable && (
        <div className="canvas-tools">
          <button
            className={!pan ? 'active' : ''}
            aria-label="Select tool"
            title="Select and drag nodes"
            aria-pressed={!pan}
            onClick={() => setPan(false)}
          >
            <MousePointer2 />
          </button>
          <button
            className={pan ? 'active' : ''}
            aria-label="Pan tool"
            title="Pan canvas"
            aria-pressed={pan}
            onClick={() => setPan(true)}
          >
            <Hand />
          </button>
          <span />
          <button aria-label="Zoom out" title="Zoom out" onClick={() => void flow.zoomOut()}>
            <Minus />
          </button>
          <b>{Math.round(zoom * 100)}%</b>
          <button aria-label="Zoom in" title="Zoom in" onClick={() => void flow.zoomIn()}>
            <Plus />
          </button>
          <span />
          <button
            aria-label="Fit graph"
            title="Fit graph to viewport"
            disabled={!nodes.length}
            onClick={() => void flow.fitView(fitOptions)}
          >
            <Maximize />
          </button>
        </div>
      )}
      {!graph.nodes.length && (
        <div className="empty">
          <div className="empty-symbol">
            <Network size={41} strokeWidth={1.35} />
          </div>
          <h2>Build your first graph</h2>
          <p>
            Add a node to the canvas, or explore a sample graph to see the algorithms in action.
          </p>
          <div className="center-actions">
            <button className="primary" disabled={!viewportReady} onClick={() => add()}>
              <Plus />
              Add node
            </button>
            <button onClick={example}>
              <FolderOpen />
              Load example
            </button>
          </div>
        </div>
      )}
      {drawable && (
        <div className="canvas-legend">
          <span>
            <i className="frontier" />
            Frontier
          </span>
          <span>
            <i className="visited" />
            Visited
          </span>
          <span>
            <i className="path" />
            Path
          </span>
        </div>
      )}
    </div>
  )
})
