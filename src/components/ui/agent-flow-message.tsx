import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, GitBranch, LoaderCircle } from 'lucide-react'
import { motion } from 'motion/react'

import type { AgentTraceEdge, AgentTraceNode, AgentTracePayload } from '@/types/agent-trace'

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

const NODE_STAGGER_S = 0.04

function isEdgeActive(edge: AgentTraceEdge, activeNodeId: string | null | undefined, activePath: string[]) {
  if (!activeNodeId) {
    return false
  }

  return edge.source === activeNodeId || edge.target === activeNodeId || (activePath.includes(edge.source) && activePath.includes(edge.target))
}

function isNodeCompleted(node: AgentTraceNode, completedNodeIds: string[]) {
  return completedNodeIds.includes(node.id)
}

function buildStepLabel(step: AgentTracePayload['active_step'], nodes: AgentTraceNode[], labels: AgentFlowLabels) {
  if (!step) {
    return labels.title
  }

  const node = nodes.find((candidate) => candidate.id === step.node_id)
  const baseLabel = node?.label ?? step.node_id
  if (typeof step.round === 'number') {
    return `${labels.live} · ${baseLabel} · ${labels.round} ${step.round}`
  }
  return `${labels.live} · ${baseLabel}`
}

export function AgentFlowMessage({ trace, isActive = false, labels }: AgentFlowMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const wasActiveRef = useRef(false)

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      setIsExpanded(true)
    }
    if (!isActive && wasActiveRef.current) {
      const timeoutId = setTimeout(() => setIsExpanded(false), 900)
      return () => clearTimeout(timeoutId)
    }
    wasActiveRef.current = isActive
  }, [isActive])

  if (!trace.nodes.length) {
    return null
  }

  const activeNodeId = trace.active_node_id
  const statusLabel = trace.status === 'running'
    ? buildStepLabel(trace.active_step, trace.nodes, labels)
    : trace.status === 'completed'
      ? labels.completed
      : trace.status === 'error'
        ? labels.error
        : labels.title

  return (
    <div className="agent-flow-panel">
      <button
        className="agent-flow-header"
        onClick={() => !isActive && setIsExpanded((value) => !value)}
        aria-expanded={isExpanded}
      >
        <GitBranch className="agent-flow-icon" />
        <span className={`agent-flow-label${isActive ? ' agent-flow-label--active' : ''}`}>{statusLabel}</span>
        {trace.status === 'running' ? (
          <LoaderCircle className="agent-flow-status-icon agent-flow-status-icon--spin" />
        ) : trace.status === 'completed' ? (
          <CheckCircle2 className="agent-flow-status-icon agent-flow-status-icon--complete" />
        ) : trace.status === 'error' ? (
          <AlertCircle className="agent-flow-status-icon agent-flow-status-icon--error" />
        ) : null}
        {!isActive ? (
          <ChevronDown className={`agent-flow-chevron${isExpanded ? ' agent-flow-chevron--open' : ''}`} />
        ) : null}
      </button>

      <div className={`agent-flow-body${isExpanded ? ' agent-flow-body--open' : ''}`}>
        <div className="agent-flow-body-inner">
          <div className="agent-flow-rounds">
            {Array.from({ length: trace.total_rounds }, (_, index) => {
              const roundNumber = index + 1
              const isCurrent = roundNumber === trace.current_round
              const isFinished = roundNumber < trace.current_round || trace.status === 'completed'
              return (
                <span
                  key={roundNumber}
                  className={`agent-flow-round${isCurrent ? ' agent-flow-round--current' : ''}${isFinished ? ' agent-flow-round--done' : ''}`}
                >
                  {labels.round} {roundNumber}
                </span>
              )
            })}
            <span className="agent-flow-round agent-flow-round--final">{labels.finalAnswer}</span>
          </div>

          <div className="agent-flow-nodes">
            {trace.nodes.map((node, index) => {
              const active = node.id === activeNodeId
              const completed = isNodeCompleted(node, trace.completed_node_ids)
              return (
                <motion.div
                  key={node.id}
                  className={`agent-flow-node${active ? ' agent-flow-node--active' : ''}${completed ? ' agent-flow-node--complete' : ''}${node.kind === 'finalizer' ? ' agent-flow-node--finalizer' : ''}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * NODE_STAGGER_S }}
                >
                  <div className="agent-flow-node-meta">
                    <span className="agent-flow-node-label">{node.label}</span>
                    <span className="agent-flow-node-kind">{node.kind === 'finalizer' ? labels.finalAnswer : labels.outputKey}</span>
                  </div>
                  <span className="agent-flow-node-output">{node.output_key}</span>
                </motion.div>
              )
            })}
          </div>

          <div className="agent-flow-edges">
            <span className="agent-flow-subtitle">{labels.activePath}</span>
            {trace.edges.map((edge) => (
              <motion.div
                key={edge.id}
                className={`agent-flow-edge${isEdgeActive(edge, activeNodeId, trace.active_path) ? ' agent-flow-edge--active' : ''}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.16 }}
              >
                <span className="agent-flow-edge-source">{edge.source}</span>
                <span className="agent-flow-edge-arrow">→</span>
                <span className="agent-flow-edge-label">{edge.label}</span>
                <span className="agent-flow-edge-arrow">→</span>
                <span className="agent-flow-edge-target">{edge.target}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}