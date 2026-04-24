import type { StructuredChatContent } from '@/types/plan-react'
import type { AgentTracePayload } from '@/types/agent-trace'

export type ChatSession = {
  sessionId: string
  title: string
  createdAt: string
  updatedAt: string
}

export type ChatSessionMessage = {
  messageId: string
  role: 'user' | 'assistant'
  content: string
  tag: string
  structured?: StructuredChatContent
  agentTrace?: AgentTracePayload
  createdAt: string
}

export type ListSessionsResponse = {
  sessions: ChatSession[]
}

export type GetMessagesResponse = {
  messages: ChatSessionMessage[]
}
