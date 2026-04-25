import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, GitBranch, LoaderCircle } from 'lucide-react'
import type { AgentTraceNode, AgentTracePayload } from '@/types/agent-trace'

// ── Design tokens ────────────────────────────────────────────────────
const F_BG     = '#0A1428'
const F_LINE   = 'rgba(255,255,255,0.08)'
const F_LINE2  = 'rgba(255,255,255,0.16)'
const F_INK    = '#FFFFFF'
const F_DIM    = 'rgba(255,255,255,0.6)'
const F_DIM2   = 'rgba(255,255,255,0.4)'
const F_GREEN  = '#22C55E'
const F_AMBER  = '#FF8A3D'
const F_VIOLET = '#A855F7'
const FONT     = `'Geist', -apple-system, system-ui, sans-serif`
const MONO     = `'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace`

// ── Layout constants ─────────────────────────────────────────────────
const NW = 180   // node width
const NH = 44    // node height
const CG = 100   // column gap
const RG = 12    // row gap
const PX = 32    // canvas x-padding
const PY = 32    // canvas y-padding

// ── Layout types ─────────────────────────────────────────────────────

// One logical node instance per round column
type ExpandedNode = {
  virtualId: string          // e.g. "agent_1_r1" or "consensus_finalizer"
  node: AgentTraceNode       // original node for display
  round: number | null       // null for finalizer column
}

// Edge with virtual source/target IDs so beziers always go left → right
type ExpandedEdge = {
  id: string
  source: string             // virtual ID
  target: string             // virtual ID
  label: string
  kind: 'context' | 'finalize'
  sourceBaseId: string       // original agent id, used for active-path highlighting
  targetBaseId: string
}

type Column = {
  key: string
  label: string
  step: string
  color: string
  nodes: ExpandedNode[]
}

type Layout = {
  columns: Column[]
  pos: Map<string, { x: number; y: number }>
  expandedEdges: ExpandedEdge[]
  cW: number
  cH: number
}

// ── Virtual-ID helpers ────────────────────────────────────────────────

function virtualId(nodeId: string, round: number, totalRounds: number): string {
  // Use plain nodeId when there is only 1 round (avoids suffix clutter)
  return totalRounds > 1 ? `${nodeId}_r${round}` : nodeId
}

// ── Layout computation ────────────────────────────────────────────────

function computeLayout(trace: AgentTracePayload): Layout {
  const participants = trace.nodes
    .filter(n => n.kind !== 'finalizer')
    .sort((a, b) => a.order - b.order)

  const finalizers = trace.nodes
    .filter(n => n.kind === 'finalizer')
    .sort((a, b) => a.order - b.order)

  // total_rounds comes from the TOML definition via the backend trace template
  const totalRounds = Math.max(1, trace.total_rounds || 1)

  const cols: Column[] = []

  // One column per round, each containing all participant nodes
  for (let r = 1; r <= totalRounds; r++) {
    cols.push({
      key: `r${r}`,
      label: `RONDA ${r}`,
      step: String(r).padStart(2, '0'),
      color: F_VIOLET,
      nodes: participants.map(n => ({
        virtualId: virtualId(n.id, r, totalRounds),
        node: n,
        round: r,
      })),
    })
  }

  if (finalizers.length > 0) {
    cols.push({
      key: 'final',
      label: 'FINAL',
      step: String(cols.length + 1).padStart(2, '0'),
      color: F_AMBER,
      nodes: finalizers.map(n => ({
        virtualId: n.id,
        node: n,
        round: null,
      })),
    })
  }

  if (cols.length === 0) {
    return { columns: [], pos: new Map(), expandedEdges: [], cW: 400, cH: 200 }
  }

  // Build position map keyed by virtual ID
  const pos = new Map<string, { x: number; y: number }>()
  cols.forEach((col, ci) => {
    const x = PX + ci * (NW + CG)
    col.nodes.forEach((en, ri) => {
      pos.set(en.virtualId, { x, y: PY + ri * (NH + RG) })
    })
  })

  // Expand edges so they always connect left-column → right-column nodes:
  //   context edge a→b: a's output in round R feeds b in round R+1
  //   finalize edge a→fin: last round's a feeds the finalizer
  const expandedEdges: ExpandedEdge[] = []
  for (const e of trace.edges) {
    if (e.kind === 'context') {
      for (let r = 1; r < totalRounds; r++) {
        const src = virtualId(e.source, r, totalRounds)
        const tgt = virtualId(e.target, r + 1, totalRounds)
        if (pos.has(src) && pos.has(tgt)) {
          expandedEdges.push({
            id: `${e.id}_r${r}_r${r + 1}`,
            source: src,
            target: tgt,
            label: e.label,
            kind: 'context',
            sourceBaseId: e.source,
            targetBaseId: e.target,
          })
        }
      }
      // With a single round, context edges within the same column are omitted
      // (no upstream context exists in round 1).
    } else if (e.kind === 'finalize') {
      const src = virtualId(e.source, totalRounds, totalRounds)
      if (pos.has(src) && pos.has(e.target)) {
        expandedEdges.push({
          id: `${e.id}_final`,
          source: src,
          target: e.target,
          label: e.label,
          kind: 'finalize',
          sourceBaseId: e.source,
          targetBaseId: e.target,
        })
      }
    }
  }

  const maxRows = Math.max(...cols.map(c => c.nodes.length))
  const cW = PX * 2 + cols.length * (NW + CG) - CG
  const cH = PY + maxRows * (NH + RG) - RG + PX

  return { columns: cols, pos, expandedEdges, cW, cH }
}

// ── Runtime-state helpers ─────────────────────────────────────────────

function isExpandedNodeActive(
  trace: AgentTracePayload,
  nodeId: string,
  round: number | null,
): boolean {
  if (nodeId !== trace.active_node_id) return false
  if (round === null) return true  // finalizer is active when it is the active_node_id
  return trace.active_step?.round === round
}

function isExpandedNodeCompleted(
  trace: AgentTracePayload,
  nodeId: string,
  round: number | null,
): boolean {
  if (round === null) return trace.completed_node_ids.includes(nodeId)
  return trace.visited_steps.some(s => s.node_id === nodeId && s.round === round)
}

// ── Icons ─────────────────────────────────────────────────────────────
function RoleIcon({ kind }: { kind: AgentTraceNode['kind'] }) {
  if (kind === 'finalizer') {
    return (
      <svg width={13} height={13} viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="5" stroke="#fff" strokeWidth="1.5" fill="none" />
        <circle cx="8" cy="8" r="2" fill="#fff" />
      </svg>
    )
  }
  return (
    <svg width={13} height={13} viewBox="0 0 16 16">
      <rect x="3" y="3" width="10" height="10" rx="2" stroke="#fff" strokeWidth="1.5" fill="none" />
      <circle cx="6" cy="7" r=".8" fill="#fff" />
      <circle cx="10" cy="7" r=".8" fill="#fff" />
      <path d="M6 10 L10 10" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function StatusDot({ completed, active }: { completed: boolean; active: boolean }) {
  const c = active ? F_AMBER : completed ? F_GREEN : F_LINE2
  return (
    <div style={{
      width: 8, height: 8, borderRadius: 4, background: c, flexShrink: 0,
      boxShadow: (active || completed) ? `0 0 8px ${c}` : 'none',
      animation: active ? 'agf-pulse 1.2s ease-in-out infinite' : 'none',
    }} />
  )
}

// ── Bezier edge path ──────────────────────────────────────────────────
function bezier(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.max(56, (bx - ax) * 0.5)
  return `M ${ax} ${ay} C ${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}`
}

// ── EdgeLayer ─────────────────────────────────────────────────────────
function EdgeLayer({
  edges,
  pos,
  trace,
  selectedId,
}: {
  edges: ExpandedEdge[]
  pos: Map<string, { x: number; y: number }>
  trace: AgentTracePayload
  selectedId: string | null
}) {
  return (
    <g>
      {edges.map(e => {
        const a = pos.get(e.source)
        const b = pos.get(e.target)
        if (!a || !b) return null

        const isFinalize   = e.kind === 'finalize'
        const isActivePath = trace.active_path.includes(e.sourceBaseId) &&
          (trace.active_path.includes(e.targetBaseId) || isFinalize)
        const involves     = selectedId !== null &&
          (e.source === selectedId || e.target === selectedId)

        const stroke = involves
          ? F_AMBER
          : isActivePath
            ? F_AMBER
            : isFinalize
              ? 'rgba(255,138,61,0.45)'
              : 'rgba(255,255,255,0.22)'
        const sw = involves ? 2.2 : isActivePath ? 1.8 : 1.2

        const ax = a.x + NW, ay = a.y + NH / 2
        const bx = b.x,      by = b.y + NH / 2
        const d  = bezier(ax, ay, bx, by)

        return (
          <g key={e.id}>
            {(isActivePath || involves) && (
              <path d={d} stroke={F_AMBER} strokeWidth={6} fill="none" opacity={0.10} />
            )}
            <path
              d={d}
              stroke={stroke}
              strokeWidth={sw}
              fill="none"
              strokeDasharray={isActivePath ? '6 4' : undefined}
              style={isActivePath ? { animation: 'agf-flow 1.6s linear infinite' } as CSSProperties : undefined}
            />
            <polygon points={`${bx - 6},${by - 3} ${bx},${by} ${bx - 6},${by + 3}`} fill={stroke} />
          </g>
        )
      })}
    </g>
  )
}

// ── NodeCard ──────────────────────────────────────────────────────────
function NodeCard({
  node,
  virtualId: vId,
  pos,
  selected,
  onClick,
  active,
  completed,
}: {
  node: AgentTraceNode
  virtualId: string
  pos: { x: number; y: number }
  selected: boolean
  onClick: (virtualId: string) => void
  active: boolean
  completed: boolean
}) {
  const isFin  = node.kind === 'finalizer'
  const accent = isFin ? F_AMBER : F_VIOLET

  return (
    <foreignObject x={pos.x} y={pos.y} width={NW} height={NH} style={{ overflow: 'visible' }}>
      <div
        onClick={() => onClick(vId)}
        style={{
          width: NW, height: NH, borderRadius: 10, cursor: 'pointer',
          background: isFin
            ? 'linear-gradient(180deg,rgba(255,138,61,.18) 0%,rgba(20,28,46,.92) 100%)'
            : 'linear-gradient(180deg,rgba(168,85,247,.10) 0%,rgba(14,26,51,.95) 100%)',
          border: `1.5px solid ${selected ? F_AMBER : active ? 'rgba(255,138,61,.55)' : F_LINE2}`,
          boxShadow: selected
            ? '0 0 0 3px rgba(255,138,61,.15),0 8px 24px -8px rgba(0,0,0,.5)'
            : '0 4px 12px -4px rgba(0,0,0,.4)',
          padding: '0 10px',
          display: 'flex', alignItems: 'center', gap: 7,
          transition: 'all .18s ease', fontFamily: FONT,
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <RoleIcon kind={node.kind} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: F_INK,
            letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {node.label}
          </div>
        </div>
        <StatusDot completed={completed} active={active} />
      </div>
    </foreignObject>
  )
}

// ── LaneHeaders ───────────────────────────────────────────────────────
function LaneHeaders({ columns, cH }: { columns: Column[]; cH: number }) {
  return (
    <g>
      {columns.map((col, ci) => {
        const x = PX + ci * (NW + CG)
        return (
          <rect
            key={col.key}
            x={x - 12} y={PY - 12}
            width={NW + 24} height={cH - PY * 2 + 24}
            rx={12}
            fill="rgba(255,255,255,0.018)"
            stroke={F_LINE}
          />
        )
      })}
    </g>
  )
}

// ── Desktop graph ─────────────────────────────────────────────────────
function FlowDesktop({ trace, layout }: { trace: AgentTracePayload; layout: Layout }) {
  const [selected, setSelected] = useState<string | null>(null)
  const { columns, pos, expandedEdges, cW, cH } = layout

  function handleNodeClick(vId: string) {
    setSelected(prev => (prev === vId ? null : vId))
  }

  // Flatten all expanded nodes across columns for rendering
  const allNodes = columns.flatMap(col => col.nodes)

  return (
    <div style={{
      padding: 20, borderRadius: 20,
      background: 'linear-gradient(180deg,rgba(20,28,46,.6) 0%,rgba(10,16,32,.6) 100%)',
      border: `1px solid ${F_LINE}`,
      boxShadow: '0 40px 80px -20px rgba(0,0,0,.6)',
    }}>
      <div style={{
        borderRadius: 14,
        background: F_BG,
        border: `1px solid ${F_LINE}`,
        position: 'relative', overflow: 'auto',
      }}>
        {/* dot grid */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, opacity: 0.35, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px)',
          backgroundSize: '20px 20px',
        }} />
        <svg
          viewBox={`0 0 ${cW} ${cH}`}
          width="100%"
          height={cH}
          style={{ display: 'block', position: 'relative', zIndex: 1, minWidth: Math.min(cW, 320) }}
        >
          <LaneHeaders columns={columns} cH={cH} />
          <EdgeLayer
            edges={expandedEdges}
            pos={pos}
            trace={trace}
            selectedId={selected}
          />
          {allNodes.map(en => {
            const p = pos.get(en.virtualId)
            if (!p) return null
            return (
              <NodeCard
                key={en.virtualId}
                node={en.node}
                virtualId={en.virtualId}
                pos={p}
                selected={selected === en.virtualId}
                onClick={handleNodeClick}
                active={isExpandedNodeActive(trace, en.node.id, en.round)}
                completed={isExpandedNodeCompleted(trace, en.node.id, en.round)}
              />
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ── Mobile node card ──────────────────────────────────────────────────
function MobileNodeCard({ en, trace, expandedEdges, selected, onClick }: {
  en: ExpandedNode
  trace: AgentTracePayload
  expandedEdges: ExpandedEdge[]
  selected: boolean
  onClick: () => void
}) {
  const { node, virtualId: vId, round } = en
  const isFin     = node.kind === 'finalizer'
  const accent    = isFin ? F_AMBER : F_VIOLET
  const active    = isExpandedNodeActive(trace, node.id, round)
  const completed = isExpandedNodeCompleted(trace, node.id, round)
  const outEdges  = expandedEdges.filter(e => e.source === vId)

  return (
    <div onClick={onClick} style={{
      position: 'relative', marginLeft: 22, marginBottom: 10,
      padding: 14, borderRadius: 12, cursor: 'pointer',
      background: isFin
        ? 'linear-gradient(180deg,rgba(255,138,61,.16),rgba(20,28,46,.92))'
        : 'rgba(20,28,46,.6)',
      border: `1.5px solid ${selected ? F_AMBER : active ? 'rgba(255,138,61,.5)' : F_LINE2}`,
      transition: 'border-color .15s ease',
    }}>
      {/* connector dot */}
      <div style={{
        position: 'absolute', left: -26, top: 22,
        width: 11, height: 11, borderRadius: 6,
        background: accent, boxShadow: `0 0 0 3px ${F_BG}`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: accent, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RoleIcon kind={node.kind} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: F_INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.label}
          </div>
        </div>
        <StatusDot completed={completed} active={active} />
      </div>

      {outEdges.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${F_LINE2}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {outEdges.slice(0, 3).map(e => (
            <div key={e.id} style={{ fontFamily: MONO, fontSize: 10.5, color: F_DIM, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: e.kind === 'finalize' ? F_AMBER : F_DIM2 }}>→</span>
              <span style={{ color: e.kind === 'finalize' ? F_AMBER : 'rgba(255,255,255,.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Mobile flow ───────────────────────────────────────────────────────
function FlowMobile({ trace, layout }: { trace: AgentTracePayload; layout: Layout }) {
  const [selected, setSelected] = useState<string | null>(null)
  const { columns, expandedEdges } = layout

  return (
    <div style={{
      padding: 16, borderRadius: 16,
      background: 'linear-gradient(180deg,rgba(20,28,46,.6) 0%,rgba(10,16,32,.6) 100%)',
      border: `1px solid ${F_LINE}`,
    }}>
      {columns.map(col => (
        <div key={col.key} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 20, height: 20, borderRadius: 5, flexShrink: 0,
              background: col.color, color: '#0A1428',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: MONO, fontSize: 9, fontWeight: 700,
            }}>
              {col.step}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: F_INK, letterSpacing: '.14em', fontWeight: 600 }}>
              {col.label}
            </div>
            <div style={{ flex: 1, height: 1, background: F_LINE }} />
          </div>

          <div style={{ paddingLeft: 11, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 11, top: 0, bottom: 0, width: 1, background: F_LINE2 }} />
            {col.nodes.map(en => (
              <MobileNodeCard
                key={en.virtualId}
                en={en}
                trace={trace}
                expandedEdges={expandedEdges}
                selected={selected === en.virtualId}
                onClick={() => setSelected(selected === en.virtualId ? null : en.virtualId)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── AgentFlowGraph — public reusable component ────────────────────────
export function AgentFlowGraph({
  trace,
}: {
  trace: AgentTracePayload
  isActive?: boolean
}) {
  const layout       = computeLayout(trace)
  const containerRef = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setNarrow(entry.contentRect.width < 640)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ fontFamily: FONT, WebkitFontSmoothing: 'antialiased' as CSSProperties['WebkitFontSmoothing'] }}
    >
      {narrow
        ? <FlowMobile trace={trace} layout={layout} />
        : <FlowDesktop trace={trace} layout={layout} />
      }
    </div>
  )
}

// ── AgentFlowMessage — chat bubble wrapper ────────────────────────────
type AgentFlowLabels = {
  title: string
  live: string
  completed: string
  error: string
  round: string
  finalAnswer: string
  outputKey: string
  activePath: string
}

type AgentFlowMessageProps = {
  trace: AgentTracePayload
  isActive?: boolean
  labels: AgentFlowLabels
}

function buildStatusLabel(trace: AgentTracePayload, isActive: boolean, labels: AgentFlowLabels): string {
  if (trace.status === 'completed') return labels.completed
  if (trace.status === 'error')     return labels.error
  if (isActive && trace.active_step) {
    const node = trace.nodes.find(n => n.id === trace.active_step?.node_id)
    const base = node?.label ?? trace.active_step.node_id
    if (typeof trace.active_step.round === 'number') {
      return `${labels.live} · ${base} · ${labels.round} ${trace.active_step.round}`
    }
    return `${labels.live} · ${base}`
  }
  return labels.title
}

export function AgentFlowMessage({ trace, isActive = false, labels }: AgentFlowMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const wasActiveRef = useRef(false)

  useEffect(() => {
    if (isActive && !wasActiveRef.current) setIsExpanded(true)
    if (!isActive && wasActiveRef.current) {
      const id = setTimeout(() => setIsExpanded(false), 900)
      return () => clearTimeout(id)
    }
    wasActiveRef.current = isActive
  }, [isActive])

  if (!trace.nodes.length) return null

  const statusLabel = buildStatusLabel(trace, isActive, labels)

  return (
    <div className="agent-flow-panel">
      <button
        className="agent-flow-header"
        onClick={() => !isActive && setIsExpanded(v => !v)}
        aria-expanded={isExpanded}
      >
        <GitBranch className="agent-flow-icon" />
        <span className={`agent-flow-label${isActive ? ' agent-flow-label--active' : ''}`}>
          {statusLabel}
        </span>
        {trace.status === 'running' ? (
          <LoaderCircle className="agent-flow-status-icon agent-flow-status-icon--spin" />
        ) : trace.status === 'completed' ? (
          <CheckCircle2 className="agent-flow-status-icon agent-flow-status-icon--complete" />
        ) : trace.status === 'error' ? (
          <AlertCircle className="agent-flow-status-icon agent-flow-status-icon--error" />
        ) : null}
        {!isActive && (
          <ChevronDown className={`agent-flow-chevron${isExpanded ? ' agent-flow-chevron--open' : ''}`} />
        )}
      </button>

      <div className={`agent-flow-body${isExpanded ? ' agent-flow-body--open' : ''}`}>
        <div className="agent-flow-body-inner" style={{ padding: '0 0 16px' }}>
          <AgentFlowGraph trace={trace} isActive={isActive} />
        </div>
      </div>
    </div>
  )
}
