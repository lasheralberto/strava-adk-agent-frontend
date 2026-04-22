import type { StructuredChatContent } from '@/types/plan-react'

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
  createdAt: string
}

export type ListSessionsResponse = {
  sessions: ChatSession[]
}

export type GetMessagesResponse = {
  messages: ChatSessionMessage[]
}
