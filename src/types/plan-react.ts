export type PlanReactSection =
  | 'planning'
  | 'reasoning'
  | 'action'
  | 'observation'
  | 'replanning'
  | 'final_answer'

export type PlanReactBlock = {
  section: PlanReactSection
  text: string
  index?: number
}

export type StructuredChatContent = {
  format: string
  blocks: PlanReactBlock[]
}

export const planReactSectionOrder: PlanReactSection[] = [
  'planning',
  'reasoning',
  'action',
  'observation',
  'replanning',
  'final_answer',
]
