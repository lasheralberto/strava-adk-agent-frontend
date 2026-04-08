import type { PlanReactBlock, PlanReactSection } from '@/types/plan-react'

type PlanReactMessageProps = {
  blocks: PlanReactBlock[]
  fallbackText?: string
}

const sectionLabels: Record<PlanReactSection, string> = {
  planning: 'Planning',
  reasoning: 'Reasoning',
  action: 'Action',
  observation: 'Observation',
  replanning: 'Replanning',
  final_answer: 'Final answer',
}

export function PlanReactMessage({ blocks, fallbackText }: PlanReactMessageProps) {
  if (blocks.length === 0) {
    return <p className="text-sm leading-6">{fallbackText ?? ''}</p>
  }

  const hasFinalAnswer = blocks.some((block) => block.section === 'final_answer')

  return (
    <div className="plan-react-container space-y-2">
      {blocks.map((block, blockIdx) => (
        <section
          key={`${block.section}-${block.index ?? blockIdx}-${blockIdx}`}
          className={`plan-react-block plan-react-${block.section}`}
        >
          <p className="section-label">{sectionLabels[block.section]}</p>
          <p className="plan-react-text whitespace-pre-wrap text-sm leading-6">{block.text}</p>
        </section>
      ))}

      {fallbackText && !hasFinalAnswer ? (
        <section className="plan-react-block plan-react-final_answer">
          <p className="section-label">Respuesta</p>
          <p className="plan-react-text whitespace-pre-wrap text-sm leading-6">{fallbackText}</p>
        </section>
      ) : null}
    </div>
  )
}
