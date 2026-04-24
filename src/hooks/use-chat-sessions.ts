import { useCallback, useState } from 'react'
import type { ChatSession, ChatSessionMessage } from '@/types/chat-sessions'
import type { AgentTracePayload } from '@/types/agent-trace'
import type { StructuredChatContent } from '@/types/plan-react'

const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')

type UseChatSessionsReturn = {
  sessions: ChatSession[]
  loadingSessions: boolean
  loadSessions: (athleteId: number) => Promise<void>
  createSession: (athleteId: number, sessionId: string, title: string) => Promise<void>
  loadSessionMessages: (athleteId: number, sessionId: string) => Promise<ChatSessionMessage[]>
  addMessage: (params: {
    athleteId: number
    sessionId: string
    messageId: string
    role: 'user' | 'assistant'
    content: string
    tag: string
    structured?: StructuredChatContent
    agentTrace?: AgentTracePayload
  }) => Promise<void>
  deleteSession: (athleteId: number, sessionId: string) => Promise<void>
  clearSessions: () => void
}

export function useChatSessions(): UseChatSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)

  const loadSessions = useCallback(async (athleteId: number) => {
    if (!apiBaseUrl) return
    setLoadingSessions(true)
    try {
      const res = await fetch(`${apiBaseUrl}/chat/sessions?athlete_id=${athleteId}`)
      if (!res.ok) return
      const data = (await res.json()) as { sessions: ChatSession[] }
      setSessions(data.sessions ?? [])
    } catch {
      // silently ignore — sessions are best-effort
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  const createSession = useCallback(async (
    athleteId: number,
    sessionId: string,
    title: string,
  ) => {
    if (!apiBaseUrl) return
    try {
      await fetch(`${apiBaseUrl}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athlete_id: athleteId, session_id: sessionId, title }),
      })
      // Prepend to local state for instant UI update
      const newSession: ChatSession = {
        sessionId,
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setSessions((prev) => [newSession, ...prev])
    } catch {
      // silently ignore
    }
  }, [])

  const loadSessionMessages = useCallback(async (
    athleteId: number,
    sessionId: string,
  ): Promise<ChatSessionMessage[]> => {
    if (!apiBaseUrl) return []
    try {
      const res = await fetch(
        `${apiBaseUrl}/chat/sessions/${sessionId}/messages?athlete_id=${athleteId}`
      )
      if (!res.ok) return []
      const data = (await res.json()) as { messages: ChatSessionMessage[] }
      return data.messages ?? []
    } catch {
      return []
    }
  }, [])

  const addMessage = useCallback(async ({
    athleteId,
    sessionId,
    messageId,
    role,
    content,
    tag,
    structured,
    agentTrace,
  }: {
    athleteId: number
    sessionId: string
    messageId: string
    role: 'user' | 'assistant'
    content: string
    tag: string
    structured?: StructuredChatContent
    agentTrace?: AgentTracePayload
  }) => {
    if (!apiBaseUrl) return
    try {
      await fetch(`${apiBaseUrl}/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athlete_id: athleteId,
          message_id: messageId,
          role,
          content,
          tag,
          ...(structured ? { structured } : {}),
          ...(agentTrace ? { agent_trace: agentTrace } : {}),
        }),
      })
      // Update session updatedAt in local state
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId === sessionId
            ? { ...s, updatedAt: new Date().toISOString() }
            : s
        )
      )
    } catch {
      // silently ignore — message already in React state
    }
  }, [])

  const deleteSession = useCallback(async (athleteId: number, sessionId: string) => {
    if (!apiBaseUrl) return
    try {
      await fetch(
        `${apiBaseUrl}/chat/sessions/${sessionId}?athlete_id=${athleteId}`,
        { method: 'DELETE' }
      )
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId))
    } catch {
      // silently ignore
    }
  }, [])

  const clearSessions = useCallback(() => {
    setSessions([])
  }, [])

  return {
    sessions,
    loadingSessions,
    loadSessions,
    createSession,
    loadSessionMessages,
    addMessage,
    deleteSession,
    clearSessions,
  }
}
