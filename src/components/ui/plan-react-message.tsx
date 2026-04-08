import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import type { PlanReactBlock, PlanReactSection } from '@/types/plan-react'

type PlanReactMessageProps = {
  blocks: PlanReactBlock[]
  fallbackText?: string
  isActive?: boolean
}

const sectionLabels: Record<PlanReactSection, string> = {
  planning: 'Planning',
  reasoning: 'Reasoning',
  action: 'Action',
  observation: 'Observation',
  replanning: 'Replanning',
  final_answer: 'Final answer',
}

export function PlanReactMessage({ blocks, fallbackText, isActive = false }: PlanReactMessageProps) {
  const thinkingBlocks = blocks.filter((b) => b.section !== 'final_answer')
  const answerBlocks = blocks.filter((b) => b.section === 'final_answer')
  const answerText = answerBlocks[answerBlocks.length - 1]?.text ?? ''

  const [isExpanded, setIsExpanded] = useState(false)
  const wasActiveRef = useRef(false)

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      setIsExpanded(true)
    }
    if (!isActive && wasActiveRef.current) {
      const t = setTimeout(() => setIsExpanded(false), 600)
      return () => clearTimeout(t)
    }
    wasActiveRef.current = isActive
  }, [isActive])

  if (blocks.length === 0) {
    return <p className="text-sm leading-6 whitespace-pre-wrap">{fallbackText ?? ''}</p>
  }

  return (
    <div className="plan-react-container">
      {thinkingBlocks.length > 0 && (
        <div className={`thinking-panel${isActive ? ' thinking-panel--active' : ''}`}>
          <button
            className="thinking-header"
            onClick={() => !isActive && setIsExpanded((v) => !v)}
            aria-expanded={isExpanded}
          >
            <Sparkles className={`thinking-icon${isActive ? ' thinking-icon--pulse' : ''}`} />
            <span className={`thinking-label${isActive ? ' thinking-label--active' : ''}`}>
              {isActive ? 'Pensando' : `Razonamiento · ${thinkingBlocks.length} ${thinkingBlocks.length === 1 ? 'paso' : 'pasos'}`}
            </span>
            {isActive ? (
              <span className="thinking-dots" aria-hidden>
                <span /><span /><span />
              </span>
            ) : (
              <ChevronDown
                className={`thinking-chevron${isExpanded ? ' thinking-chevron--open' : ''}`}
              />
            )}
          </button>

          <div className={`thinking-body${isExpanded ? ' thinking-body--open' : ''}`}>
            <div className="thinking-body-inner">
              {thinkingBlocks.map((block, idx) => (
                <div
                  key={`${block.section}-${block.index ?? idx}-${idx}`}
                  className={`thinking-block thinking-block--${block.section}`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <span className="thinking-block-label">{sectionLabels[block.section]}</span>
                  <p className="thinking-block-text">{block.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {(answerText || (!thinkingBlocks.length && fallbackText)) && (
        <p className="text-sm leading-6 whitespace-pre-wrap mt-2">
          {answerText || fallbackText}
        </p>
      )}
    </div>
  )
}
