import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ChevronDown,
  CircleCheck,
  LogIn,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  ShieldAlert,
  Sun,
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { ChatSidebar } from '@/components/ui/chat-sidebar'
import { useChatSessions } from '@/hooks/use-chat-sessions'
import type { ChatSessionMessage } from '@/types/chat-sessions'
import { AnimatePresence, MotionConfig, motion, type Variants } from 'motion/react'
import AuthSwitch from '@/components/ui/auth-switch'
import RuixenPromptBox from '@/components/ui/ruixen-prompt-box'
import { BouncingDots } from '@/components/ui/bouncing-dots'
import { PlanReactMessage } from '@/components/ui/plan-react-message'
import { ActivitiesRunsPanel } from '@/components/ui/activities-runs-panel'
import { CustomizableAgentsPanel } from '@/components/ui/customizable-agents-panel'
import {
  planReactSectionOrder,
  type PlanReactBlock,
  type PlanReactSection,
  type StructuredChatContent,
} from '@/types/plan-react'
import { parse as parseToml } from 'smol-toml'
import './styles/chat.css'

// ── Animation constants ───────────────────────────────────────────────────────
const MSG_SLIDE_Y_PX = 10
const MSG_SLIDE_X_USER_PX = 8
const MSG_SPRING = { type: 'spring' as const, stiffness: 360, damping: 28, mass: 0.8 }
const MSG_EXIT_DURATION_S = 0.12
const BADGE_DURATION_S = 0.18
const BANNER_DURATION_S = 0.2
const EMPTY_STATE_DURATION_S = 0.35

const userMsgVariants: Variants = {
  hidden: { opacity: 0, y: MSG_SLIDE_Y_PX, x: MSG_SLIDE_X_USER_PX, scale: 0.96 },
  visible: { opacity: 1, y: 0, x: 0, scale: 1, transition: MSG_SPRING },
  exit: { opacity: 0, y: -4, transition: { duration: MSG_EXIT_DURATION_S, ease: 'easeIn' } },
}

const assistantMsgVariants: Variants = {
  hidden: { opacity: 0, y: MSG_SLIDE_Y_PX, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: MSG_SPRING },
  exit: { opacity: 0, y: -4, transition: { duration: MSG_EXIT_DURATION_S, ease: 'easeIn' } },
}

type ChatRole = 'assistant' | 'user'

type ChatMessage = {
  id: number
  role: ChatRole
  title: string
  content: string
  tag: string
  structured?: StructuredChatContent
}

type RequestStatus = 'idle' | 'requesting' | 'streaming'

type StructuredApiPayload = {
  format?: string
  section?: string
  text?: string
  index?: number
  blocks?: Array<{
    section?: string
    text?: string
    index?: number
  }>
  sections?: Record<string, string[]>
}

type ChatApiPayload = {
  response?: string
  tool_calls?: Array<Record<string, unknown>>
  structured?: StructuredApiPayload
}



type StravaAthlete = {
  id?: number
  firstname?: string
  lastname?: string
  username?: string
}

type StravaAuthSession = {
  access_token: string
  refresh_token: string
  expires_at: number
  token_type?: string
  athlete?: StravaAthlete
}

const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')
const internalPipelineToken = (import.meta.env.VITE_INTERNAL_PIPELINE_TOKEN ?? '').trim()
const stravaScope = (import.meta.env.VITE_STRAVA_SCOPE ?? 'read,activity:read_all,profile:read_all').trim()
const sessionStorageAuthKey = 'strava_oauth_session_v1'
const DEFAULT_AGENT_ID = 'wiki_research_chat'
const MODEL_OPTIONS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
const DEFAULT_MODEL = MODEL_OPTIONS[0]
const RESERVED_AGENT_IDS = new Set([
  'intent_router',
  'plan_react_planner',
  'strava_ingestion_agent',
  'query_agent',
  'answer_agent',
  'orchestrator',
  DEFAULT_AGENT_ID,
])
const planReactPhaseEvents = new Set<PlanReactSection>(planReactSectionOrder)

const planReactOrderIndex = planReactSectionOrder.reduce(
  (accumulator, section, index) => {
    accumulator[section] = index
    return accumulator
  },
  {} as Record<PlanReactSection, number>,
)

const initialMessages: ChatMessage[] = []

function buildRequestMessage(message: string, transform: string | null): string {
  if (!transform) {
    return message
  }

  return `${message}\n\nTransformacion solicitada: ${transform}.`
}

function buildAssistantMessage(content: string, tag = 'Respuesta'): ChatMessage {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    role: 'assistant',
    title: 'Athly',
    content,
    tag,
  }
}

function updateAssistantMessage(
  currentMessages: ChatMessage[],
  messageId: number,
  content: string,
  tag: string,
): ChatMessage[] {
  const nextMessages = currentMessages.map((message) =>
    message.id === messageId ? { ...message, content, tag } : message,
  )

  const hasMessage = nextMessages.some((message) => message.id === messageId)
  if (hasMessage) {
    return nextMessages
  }

  return [
    ...currentMessages,
    {
      id: messageId,
      role: 'assistant',
      title: 'Athly',
      content,
      tag,
    },
  ]
}

function toPlanReactSection(value: string | undefined | null): PlanReactSection | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase() as PlanReactSection
  return planReactPhaseEvents.has(normalized) ? normalized : null
}

function mergeStructuredBlocks(
  existingBlocks: PlanReactBlock[],
  incomingBlocks: PlanReactBlock[],
): PlanReactBlock[] {
  if (incomingBlocks.length === 0) {
    return existingBlocks
  }

  const nextBlocks = [...existingBlocks]

  for (const block of incomingBlocks) {
    const sameIndexedBlock =
      typeof block.index === 'number'
        ? nextBlocks.findIndex(
            (candidate) => candidate.section === block.section && candidate.index === block.index,
          )
        : -1

    if (sameIndexedBlock !== -1) {
      nextBlocks[sameIndexedBlock] = block
      continue
    }

    const alreadyPresent = nextBlocks.some(
      (candidate) =>
        candidate.section === block.section &&
        candidate.text.trim() === block.text.trim() &&
        candidate.index === block.index,
    )

    if (!alreadyPresent) {
      nextBlocks.push(block)
    }
  }

  return nextBlocks.sort((left, right) => {
    const leftOrder = planReactOrderIndex[left.section] ?? 999
    const rightOrder = planReactOrderIndex[right.section] ?? 999
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    const leftIndex = typeof left.index === 'number' ? left.index : Number.MAX_SAFE_INTEGER
    const rightIndex = typeof right.index === 'number' ? right.index : Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
  })
}

function parseStructuredBlocks(payload: ChatApiPayload, eventName?: string): PlanReactBlock[] {
  const structured = payload.structured
  if (!structured) {
    return []
  }

  const blocks: PlanReactBlock[] = []

  if (Array.isArray(structured.blocks)) {
    for (const block of structured.blocks) {
      const section = toPlanReactSection(block.section)
      const text = typeof block.text === 'string' ? block.text.trim() : ''
      if (!section || !text) {
        continue
      }
      blocks.push({
        section,
        text,
        index: typeof block.index === 'number' ? block.index : undefined,
      })
    }
  }

  if (structured.sections && typeof structured.sections === 'object') {
    for (const [sectionKey, values] of Object.entries(structured.sections)) {
      const section = toPlanReactSection(sectionKey)
      if (!section || !Array.isArray(values)) {
        continue
      }

      values.forEach((value, valueIndex) => {
        const text = typeof value === 'string' ? value.trim() : ''
        if (!text) {
          return
        }
        blocks.push({
          section,
          text,
          index: valueIndex,
        })
      })
    }
  }

  const singleSection = toPlanReactSection(structured.section)
  const singleText = typeof structured.text === 'string' ? structured.text.trim() : ''
  if (singleSection && singleText) {
    blocks.push({
      section: singleSection,
      text: singleText,
      index: typeof structured.index === 'number' ? structured.index : undefined,
    })
  }

  if (blocks.length === 0) {
    const eventSection = toPlanReactSection(eventName)
    const fallbackText = typeof payload.response === 'string' ? payload.response.trim() : ''
    if (eventSection && fallbackText) {
      blocks.push({
        section: eventSection,
        text: fallbackText,
      })
    }
  }

  return mergeStructuredBlocks([], blocks)
}

function updateAssistantStructuredBlocks(
  currentMessages: ChatMessage[],
  messageId: number,
  blocks: PlanReactBlock[],
  tag: string,
): ChatMessage[] {
  if (blocks.length === 0) {
    return currentMessages
  }

  const nextMessages = currentMessages.map((message) => {
    if (message.id !== messageId) {
      return message
    }

    const currentBlocks = message.structured?.blocks ?? []
    const mergedBlocks = mergeStructuredBlocks(currentBlocks, blocks)

    return {
      ...message,
      tag,
      structured: {
        format: message.structured?.format ?? 'plan_react_v1',
        blocks: mergedBlocks,
      },
    }
  })

  const hasMessage = nextMessages.some((message) => message.id === messageId)
  if (hasMessage) {
    return nextMessages
  }

  return [
    ...currentMessages,
    {
      id: messageId,
      role: 'assistant',
      title: 'Athly',
      content: '',
      tag,
      structured: {
        format: 'plan_react_v1',
        blocks,
      },
    },
  ]
}

function parseSseEventBlock(block: string): { event: string; data: string } | null {
  const lines = block.split('\n')
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line) {
      continue
    }

    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    event,
    data: dataLines.join('\n'),
  }
}

function getDefaultRedirectUri(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  const configured = (import.meta.env.VITE_STRAVA_REDIRECT_URI ?? '').trim()
  if (configured) {
    return configured
  }

  return `${window.location.origin}/`
}


function isTokenExpired(expiresAt: number): boolean {
  const now = Math.floor(Date.now() / 1000)
  return expiresAt <= now + 60
}

function isAuthorizationFailure(status: number, errorMessage: string): boolean {
  if (status === 401 || status === 403) {
    return true
  }

  const normalized = errorMessage.toLowerCase()
  return (
    normalized.includes('unauthorized') ||
    normalized.includes('authorization') ||
    normalized.includes('access token') ||
    normalized.includes('invalid token') ||
    normalized.includes('expired token') ||
    normalized.includes('token expired') ||
    normalized.includes('401')
  )
}

async function readBackendErrorMessage(response: Response): Promise<string> {
  let backendError = 'No se pudo obtener respuesta del backend.'
  try {
    const data = (await response.json()) as {
      error?: string
      details?: string
      message?: string
    }
    backendError = data.error ?? data.details ?? data.message ?? backendError
  } catch {
    // Keep default error when backend payload is not JSON.
  }

  return backendError
}

function readStoredSession(): StravaAuthSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = sessionStorage.getItem(sessionStorageAuthKey)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StravaAuthSession
    if (!parsed.access_token || !parsed.refresh_token || !parsed.expires_at) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeStoredSession(session: StravaAuthSession | null): void {
  if (typeof window === 'undefined') {
    return
  }

  if (!session) {
    sessionStorage.removeItem(sessionStorageAuthKey)
    return
  }

  sessionStorage.setItem(sessionStorageAuthKey, JSON.stringify(session))
}

function App() {
  const [messages, setMessages] = useState(initialMessages)
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle')
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<number | null>(null)
  const [authSession, setAuthSession] = useState<StravaAuthSession | null>(() => readStoredSession())
  const [authPending, setAuthPending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [lastSyncStatus, setLastSyncStatus] = useState<'success' | 'failed' | 'queued' | null>(null)
  const [activitiesRefreshKey, setActivitiesRefreshKey] = useState(0)
  const [selectedAgentId, setSelectedAgentId] = useState(DEFAULT_AGENT_ID)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const authSessionRef = useRef<StravaAuthSession | null>(authSession)
  const refreshInFlightRef = useRef<Promise<StravaAuthSession | null> | null>(null)
  const messageStreamRef = useRef<HTMLDivElement | null>(null)
  const finalAssistantContentRef = useRef<{ content: string; tag: string; structured?: import('@/types/plan-react').StructuredChatContent } | null>(null)
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const {
    sessions,
    loadingSessions,
    loadSessions,
    createSession,
    loadSessionMessages,
    addMessage,
    deleteSession,
    clearSessions,
  } = useChatSessions()

  useEffect(() => {
    authSessionRef.current = authSession
  }, [authSession])

  useEffect(() => {
    if (!userMenuOpen) return
    const handle = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [userMenuOpen])

  const clearAuthSession = useCallback((message?: string) => {
    authSessionRef.current = null
    setAuthSession(null)
    writeStoredSession(null)
    if (message) {
      setAuthError(message)
    }
  }, [])

  const refreshStravaSession = useCallback(
    async (currentSession: StravaAuthSession): Promise<StravaAuthSession> => {
      const response = await fetch(`${apiBaseUrl}/auth/strava/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: currentSession.refresh_token,
          strava_athlete_id: currentSession.athlete?.id,
        }),
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as {
          error?: string
          details?: string
        }
        throw new Error(
          errorPayload.error ??
            errorPayload.details ??
            'Tu sesion de Strava expiro. Inicia sesion de nuevo.',
        )
      }

      const refreshed = (await response.json()) as StravaAuthSession
      if (!refreshed.access_token || !refreshed.refresh_token || !refreshed.expires_at) {
        throw new Error('Respuesta de refresh invalida desde backend.')
      }

      // Strava does not return athlete in refresh responses, so preserve it from the current session.
      const mergedSession: StravaAuthSession = {
        ...refreshed,
        athlete: refreshed.athlete?.id ? refreshed.athlete : currentSession.athlete,
      }

      authSessionRef.current = mergedSession
      setAuthSession(mergedSession)
      writeStoredSession(mergedSession)
      return mergedSession
    },
    [],
  )

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  useEffect(() => {
    const runOAuthCallbackExchange = async () => {
      if (!apiBaseUrl || typeof window === 'undefined') {
        return
      }

      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')?.trim()
      const state = url.searchParams.get('state')?.trim()
      const callbackScope = url.searchParams.get('scope')?.trim()
      const oauthError = url.searchParams.get('error')?.trim()

      if (!code && !state && !oauthError) {
        return
      }

      if (oauthError) {
        setAuthError(`Strava devolvio error en autorizacion: ${oauthError}`)
        url.search = ''
        window.history.replaceState({}, document.title, url.toString())
        return
      }

      if (!code || !state) {
        setAuthError('Callback incompleto de Strava: faltan code o state.')
        url.search = ''
        window.history.replaceState({}, document.title, url.toString())
        return
      }

      setAuthPending(true)
      setAuthError(null)

      try {
        const redirectUri = getDefaultRedirectUri()
        const response = await fetch(`${apiBaseUrl}/auth/strava/exchange`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            state,
            scope: callbackScope,
            redirect_uri: redirectUri,
          }),
        })

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as {
            error?: string
            details?: string
          }
          throw new Error(errorPayload.error ?? errorPayload.details ?? 'Fallo el intercambio de token con Strava.')
        }

        const tokenPayload = (await response.json()) as StravaAuthSession
        if (!tokenPayload.access_token || !tokenPayload.refresh_token || !tokenPayload.expires_at) {
          throw new Error('Respuesta de token invalida desde backend.')
        }

        setAuthSession(tokenPayload)
        writeStoredSession(tokenPayload)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado completando OAuth.'
        setAuthError(message)
      } finally {
        setAuthPending(false)
        url.search = ''
        window.history.replaceState({}, document.title, url.toString())
      }
    }

    runOAuthCallbackExchange()
  }, [])

  const ensureValidStravaSession = useCallback(async (): Promise<StravaAuthSession | null> => {
    const currentSession = authSessionRef.current
    if (!currentSession) {
      return null
    }

    if (!isTokenExpired(currentSession.expires_at)) {
      return currentSession
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current
    }

    const refreshPromise = (async () => {
      try {
        return await refreshStravaSession(currentSession)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Tu sesion de Strava expiro. Inicia sesion de nuevo.'
        clearAuthSession(message)
        throw new Error(message)
      }
    })()

    refreshInFlightRef.current = refreshPromise

    return refreshPromise.finally(() => {
      if (refreshInFlightRef.current === refreshPromise) {
        refreshInFlightRef.current = null
      }
    })
  }, [clearAuthSession, refreshStravaSession])

  useEffect(() => {
    if (messages.length === 0) {
      return
    }

    const container = messageStreamRef.current
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [messages, requestStatus])

  const fetchIndexingStatus = useCallback(async () => {
    const athleteId = authSessionRef.current?.athlete?.id
    if (!apiBaseUrl || !athleteId) return
    try {
      const res = await fetch(`${apiBaseUrl}/pipeline/indexing-status?athlete_id=${athleteId}`)
      if (!res.ok) return
      const data = (await res.json()) as { last_sync_status?: string }
      const status = data.last_sync_status
      if (status === 'success' || status === 'failed' || status === 'queued') {
        setLastSyncStatus(status)
      } else {
        setLastSyncStatus(null)
      }
    } catch {
      // silently ignore
    }
  }, [apiBaseUrl])

  useEffect(() => {
    if (authSession?.athlete?.id) {
      fetchIndexingStatus()
    } else {
      setLastSyncStatus(null)
    }
  }, [authSession, fetchIndexingStatus])

  const fetchSavedAgentId = useCallback(async () => {
    const athleteId = authSessionRef.current?.athlete?.id
    if (!apiBaseUrl || !athleteId) return
    try {
      const headers: Record<string, string> = {}
      if (internalPipelineToken) headers['X-Internal-Token'] = internalPipelineToken
      const res = await fetch(`${apiBaseUrl}/agent-definition/${athleteId}`, { headers })
      if (!res.ok) return
      const payload = (await res.json()) as { toml_content?: string; is_default?: boolean }
      if (payload.is_default || !payload.toml_content) return

      const root = parseToml(payload.toml_content) as Record<string, unknown>
      const agents = Array.isArray(root.agents) ? root.agents : []
      const firstCustom = agents.find((a): a is Record<string, unknown> =>
        a !== null && typeof a === 'object' && !Array.isArray(a) &&
        typeof (a as Record<string, unknown>).id === 'string' &&
        !RESERVED_AGENT_IDS.has(((a as Record<string, unknown>).id as string).trim()),
      )
      if (firstCustom && typeof firstCustom.id === 'string' && firstCustom.id.trim()) {
        setSelectedAgentId(firstCustom.id.trim())
      }
    } catch {
      // silently ignore — fall back to default agent
    }
  }, [])

  useEffect(() => {
    if (authSession?.athlete?.id) {
      fetchSavedAgentId()
    } else {
      setSelectedAgentId(DEFAULT_AGENT_ID)
    }
  }, [authSession, fetchSavedAgentId])

  useEffect(() => {
    if (authSession?.athlete?.id) {
      loadSessions(authSession.athlete.id)
    } else {
      clearSessions()
      setCurrentSessionId(null)
    }
  }, [authSession, loadSessions, clearSessions])

  const handleStartStravaLogin = async () => {
    if (!apiBaseUrl || authPending) {
      return
    }

    setAuthPending(true)
    setAuthError(null)

    try {
      const redirectUri = getDefaultRedirectUri()
      const query = new URLSearchParams({
        redirect_uri: redirectUri,
        scope: stravaScope,
      })
      const response = await fetch(`${apiBaseUrl}/auth/strava/start?${query.toString()}`)

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorPayload.error ?? 'No se pudo iniciar OAuth de Strava.')
      }

      const payload = (await response.json()) as { auth_url?: string }
      if (!payload.auth_url) {
        throw new Error('Backend no devolvio auth_url.')
      }

      window.location.href = payload.auth_url
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado iniciando login con Strava.'
      setAuthError(message)
      setAuthPending(false)
    }
  }

  const handleLogout = () => {
    setAuthError(null)
    clearAuthSession()
    clearSessions()
    setCurrentSessionId(null)
    setMessages([])
  }

  const handleRunDailyPipeline = async () => {
    if (pipelineStatus === 'running' || lastSyncStatus === 'queued') return

    if (!authSession) {
      handleStartStravaLogin()
      return
    }

    let session: StravaAuthSession | null = null
    try {
      session = await ensureValidStravaSession()
    } catch {
      // ensureValidStravaSession already clears the session on error
    }

    if (!session?.athlete?.id) {
      handleStartStravaLogin()
      return
    }

    setPipelineStatus('running')
    setLastSyncStatus('queued')
    setActivitiesRefreshKey((k) => k + 1)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (internalPipelineToken) headers['X-Internal-Token'] = internalPipelineToken
      // New per-activity flow: backend ingests the latest N Strava activities,
      // deduplicates against the GCS bucket and queues them in Firestore
      // (`activities_runs`). No `target_date` — processing is per-activity now.
      const response = await fetch(`${apiBaseUrl}/pipeline/daily`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          athlete_id: session.athlete.id,
          latest_limit: 10,
        }),
      })
      if (!response.ok) {
        if (response.status === 401) {
          clearAuthSession()
          handleStartStravaLogin()
          return
        }
        const err = await readBackendErrorMessage(response)
        throw new Error(err)
      }

      // Poll /pipeline/runs until research_wiki stage reaches a terminal state
      const POLL_INTERVAL_MS = 4000
      const POLL_TIMEOUT_MS = 5 * 60 * 1000
      const pollStart = Date.now()

      const pollRunStatus = async (): Promise<void> => {
        if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
          setLastSyncStatus('failed')
          setPipelineStatus('error')
          setTimeout(() => setPipelineStatus('idle'), 3000)
          return
        }

        try {
          const pollRes = await fetch(
            `${apiBaseUrl}/pipeline/runs?stage=research_wiki&limit=1`,
            internalPipelineToken
              ? { headers: { 'X-Internal-Token': internalPipelineToken } }
              : undefined,
          )
          if (pollRes.ok) {
            const pollData = (await pollRes.json()) as { runs?: Array<{ status?: string }> }
            const runStatus = pollData.runs?.[0]?.status

            if (runStatus === 'success') {
              setLastSyncStatus('success')
              setPipelineStatus('success')
              setActivitiesRefreshKey((k) => k + 1)
              setTimeout(() => setPipelineStatus('idle'), 3000)
              return
            }

            if (runStatus === 'skipped') {
              setLastSyncStatus(null)
              setPipelineStatus('idle')
              return
            }

            if (runStatus === 'failed' || runStatus === 'partial_failure') {
              setLastSyncStatus('failed')
              setPipelineStatus('error')
              setTimeout(() => setPipelineStatus('idle'), 3000)
              return
            }

            // queued or running — keep spinner + yellow
            setLastSyncStatus(runStatus === 'running' ? 'queued' : 'queued')
          }
        } catch {
          // network hiccup — keep polling
        }

        setTimeout(pollRunStatus, POLL_INTERVAL_MS)
      }

      setTimeout(pollRunStatus, POLL_INTERVAL_MS)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error ejecutando pipeline.'
      setAuthError(message)
      setLastSyncStatus('failed')
      setPipelineStatus('error')
      setTimeout(() => setPipelineStatus('idle'), 3000)
    }
  }


  const handleNewSession = useCallback(() => {
    setMessages([])
    setCurrentSessionId(null)
    setSidebarOpen(false)
  }, [])

  const handleSelectSession = useCallback(async (sessionId: string) => {
    const athleteId = authSessionRef.current?.athlete?.id
    if (!athleteId) return

    const loaded: ChatSessionMessage[] = await loadSessionMessages(athleteId, sessionId)
    const restored: ChatMessage[] = loaded.map((m) => ({
      id: Number(m.messageId),
      role: m.role,
      title: m.role === 'user' ? 'Tu' : 'Athly',
      content: m.content,
      tag: m.tag,
      structured: m.structured,
    }))

    setMessages(restored)
    setCurrentSessionId(sessionId)
    setSidebarOpen(false)
  }, [loadSessionMessages])

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    const athleteId = authSessionRef.current?.athlete?.id
    if (!athleteId) return

    await deleteSession(athleteId, sessionId)
    if (currentSessionId === sessionId) {
      setMessages([])
      setCurrentSessionId(null)
    }
  }, [deleteSession, currentSessionId])

  const handleSend = async ({ message, transform, model }: { message: string; transform: string | null; model: string }) => {
    const isSending = requestStatus !== 'idle'
    finalAssistantContentRef.current = null
    const trimmedMessage = message.trim()
    if ((!trimmedMessage && !transform) || isSending) {
      return
    }

    const composedMessage = trimmedMessage || `Aplicar transformacion: ${transform}`
    const requestMessage = buildRequestMessage(composedMessage, transform)
    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      title: 'Tu',
      content: composedMessage,
      tag: transform ?? 'Consulta',
    }

    startTransition(() => {
      setMessages((currentMessages) => [...currentMessages, userMessage])
    })

    if (!authSession) {
      setMessages((currentMessages) => [
        ...currentMessages,
        buildAssistantMessage(
          'Inicia sesión con Strava para comenzar.',
          'Autenticación requerida',
        ),
      ])
      return
    }

    if (!apiBaseUrl) {
      setMessages((currentMessages) => [
        ...currentMessages,
        buildAssistantMessage(
          'El servicio no está disponible en este momento. Inténtalo de nuevo más tarde.',
          'Error',
        ),
      ])
      return
    }

    // Create session on first message
    const athleteId = authSession?.athlete?.id
    let activeSessionId = currentSessionId
    if (athleteId && !activeSessionId) {
      const newSessionId = nanoid()
      const sessionTitle = composedMessage.slice(0, 20)
      activeSessionId = newSessionId
      setCurrentSessionId(newSessionId)
      await createSession(athleteId, newSessionId, sessionTitle)
    }

    // Persist user message
    if (athleteId && activeSessionId) {
      await addMessage({
        athleteId,
        sessionId: activeSessionId,
        messageId: String(userMessage.id),
        role: 'user',
        content: userMessage.content,
        tag: userMessage.tag,
      })
    }

    const assistantMessageId = Date.now() + 1
    setRequestStatus('requesting')
    setActiveAssistantMessageId(assistantMessageId)

    try {
      let session = await ensureValidStravaSession()
      if (!session) {
        throw new Error('No hay sesion Strava activa. Inicia sesion para continuar.')
      }

      let streamedResponse = ''
      let accumulatedBlocks: PlanReactBlock[] = []

      setMessages((currentMessages) =>
        updateAssistantMessage(currentMessages, assistantMessageId, '', transform ?? 'Streaming'),
      )

      const sendChatRequest = (activeSession: StravaAuthSession): Promise<Response> => {
        return fetch(`${apiBaseUrl}/chat/wiki`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: requestMessage,
            stream: true,
            athlete_id: activeSession.athlete?.id,
            agent_id: selectedAgentId,
            model: model || DEFAULT_MODEL,
          }),
        })
      }

      let response = await sendChatRequest(session)

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({})) as {
          error?: string
          details?: string
          message?: string
        }

        if (response.status === 404 && errorPayload.error === 'wiki_not_found') {
          throw new Error(
            errorPayload.details ??
            'Aún no tienes un informe de entrenamiento generado. Ejecuta la pipeline diaria primero.',
          )
        }

        let backendError = errorPayload.error ?? errorPayload.details ?? errorPayload.message ?? 'No se pudo obtener respuesta del backend.'
        if (isAuthorizationFailure(response.status, backendError)) {
          try {
            session = await refreshStravaSession(session)
            setAuthError(null)
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : 'Tu sesion de Strava expiro. Inicia sesion de nuevo.'
            clearAuthSession(message)
            throw new Error(message)
          }

          response = await sendChatRequest(session)
          if (!response.ok) {
            backendError = await readBackendErrorMessage(response)
            if (isAuthorizationFailure(response.status, backendError)) {
              const message = 'La sesion de Strava no pudo renovarse. Autoriza de nuevo.'
              clearAuthSession(message)
              throw new Error(message)
            }
            throw new Error(backendError)
          }
        } else {
          throw new Error(backendError)
        }
      }

      const contentType = response.headers.get('content-type') ?? ''
      const isEventStream = contentType.includes('text/event-stream')

      if (!isEventStream) {
        const payload = (await response.json()) as ChatApiPayload
        const structuredBlocks = parseStructuredBlocks(payload)
        const finalText = (payload.response ?? '').trim() || 'El backend respondio sin contenido.'
        setMessages((currentMessages) => {
          let nextMessages = updateAssistantMessage(
            currentMessages,
            assistantMessageId,
            finalText,
            transform ?? 'Respuesta',
          )

          if (structuredBlocks.length > 0) {
            nextMessages = updateAssistantStructuredBlocks(
              nextMessages,
              assistantMessageId,
              structuredBlocks,
              transform ?? 'Respuesta',
            )
          }

          return nextMessages
        })
        const nonStreamFinalText = (payload.response ?? '').trim() || 'El backend respondio sin contenido.'
        finalAssistantContentRef.current = {
          content: nonStreamFinalText,
          tag: transform ?? 'Respuesta',
          structured: structuredBlocks.length > 0 ? { format: 'plan_react_v1', blocks: structuredBlocks } : undefined,
        }
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('El navegador no pudo abrir el stream de respuesta.')
      }

      setRequestStatus('streaming')

      const decoder = new TextDecoder()
      let buffer = ''
      let streamCompleted = false

      while (!streamCompleted) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

        let boundaryIndex = buffer.indexOf('\n\n')
        while (boundaryIndex !== -1) {
          const block = buffer.slice(0, boundaryIndex)
          buffer = buffer.slice(boundaryIndex + 2)

          const parsedEvent = parseSseEventBlock(block)
          if (parsedEvent) {
            const payload = JSON.parse(parsedEvent.data) as ChatApiPayload

            if (parsedEvent.event === 'error') {
              throw new Error(payload.response || 'El backend devolvio un error en streaming.')
            }

            if (parsedEvent.event === 'done') {
              streamCompleted = true
              break
            }

            if (parsedEvent.event === 'heartbeat') {
              boundaryIndex = buffer.indexOf('\n\n')
              continue
            }

            const structuredBlocks = parseStructuredBlocks(payload, parsedEvent.event)
            if (structuredBlocks.length > 0) {
              setMessages((currentMessages) =>
                updateAssistantStructuredBlocks(
                  currentMessages,
                  assistantMessageId,
                  structuredBlocks,
                  transform ?? 'Streaming',
                ),
              )
              accumulatedBlocks = mergeStructuredBlocks(accumulatedBlocks, structuredBlocks)

              const finalAnswerBlocks = structuredBlocks.filter(
                (structuredBlock) => structuredBlock.section === 'final_answer',
              )
              const latestFinalAnswer = finalAnswerBlocks[finalAnswerBlocks.length - 1]
              if (latestFinalAnswer?.text) {
                streamedResponse = latestFinalAnswer.text
                setMessages((currentMessages) =>
                  updateAssistantMessage(
                    currentMessages,
                    assistantMessageId,
                    streamedResponse,
                    transform ?? 'Streaming',
                  ),
                )
              }
            }

            if (payload.response) {
              if (parsedEvent.event === 'final_answer') {
                streamedResponse = payload.response
              } else {
                streamedResponse += payload.response
              }
              setMessages((currentMessages) =>
                updateAssistantMessage(
                  currentMessages,
                  assistantMessageId,
                  streamedResponse,
                  transform ?? 'Streaming',
                ),
              )
            }
          }

          boundaryIndex = buffer.indexOf('\n\n')
        }

        if (done) {
          streamCompleted = true
        }
      }

      const finalText = streamedResponse.trim() || 'El backend respondio sin contenido.'
      setMessages((currentMessages) =>
        updateAssistantMessage(currentMessages, assistantMessageId, finalText, transform ?? 'Respuesta'),
      )
      finalAssistantContentRef.current = {
        content: finalText,
        tag: transform ?? 'Respuesta',
        structured: accumulatedBlocks.length > 0 ? { format: 'plan_react_v1', blocks: accumulatedBlocks } : undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado al contactar el backend.'
      setMessages((currentMessages) =>
        updateAssistantMessage(currentMessages, assistantMessageId, message, 'Error'),
      )
      finalAssistantContentRef.current = { content: message, tag: 'Error' }
    } finally {
      setRequestStatus('idle')
      setActiveAssistantMessageId(null)
      // Persist final assistant message to Firestore
      if (athleteId && activeSessionId && finalAssistantContentRef.current) {
        const { content, tag, structured } = finalAssistantContentRef.current
        void addMessage({
          athleteId,
          sessionId: activeSessionId,
          messageId: String(assistantMessageId),
          role: 'assistant',
          content,
          tag,
          structured,
        })
        finalAssistantContentRef.current = null
      }
    }
  }

  if (!authSession) {
    return (
      <MotionConfig reducedMotion="user">
        <AuthSwitch
          onLogin={handleStartStravaLogin}
          isPending={authPending}
          error={authError}
        />
      </MotionConfig>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="chat-shell h-screen overflow-hidden bg-background text-foreground">
      <main className="flex h-full w-full">
        <ChatSidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          loading={loadingSessions}
          isOpen={sidebarOpen}
          onNewSession={handleNewSession}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onClose={() => setSidebarOpen(false)}
        />
        <section className="glass-panel flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir historial de sesiones"
                className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-title-2 font-semibold tracking-tight text-foreground">
                  Athly
                </h1>
                <p className="hidden text-[11px] text-muted-foreground sm:block">Your AI coach</p>
              </div>
              <AnimatePresence mode="wait">
                {authSession ? (
                  <motion.span
                    key="connected"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: BADGE_DURATION_S, ease: 'linear' }}
                    role="status"
                    className="inline-flex items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-2 py-0.5 text-[12px] font-medium text-success"
                  >
                    <CircleCheck className="h-3 w-3" aria-hidden="true" />
                    <span className="hidden sm:inline">Conectado</span>
                  </motion.span>
                ) : (
                  <motion.span
                    key="disconnected"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: BADGE_DURATION_S, ease: 'linear' }}
                    role="status"
                    className="inline-flex items-center gap-1 rounded-sm border border-warning/40 bg-warning/10 px-2 py-0.5 text-[12px] font-medium text-warning"
                  >
                    <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                    <span className="hidden sm:inline">Sin login</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {authSession ? (
                <>
                  <ActivitiesRunsPanel
                    athleteId={authSession.athlete?.id ?? null}
                    refreshKey={activitiesRefreshKey}
                  />
                  <CustomizableAgentsPanel
                    isDark={isDark}
                    athleteId={authSession.athlete?.id ?? null}
                    selectedAgentId={selectedAgentId}
                    onAgentChange={setSelectedAgentId}
                  />
                  {(() => {
                    const syncing = pipelineStatus === 'running' || lastSyncStatus === 'queued'
                    const syncLabel = syncing
                      ? 'Sincronizando actividades'
                      : lastSyncStatus === 'failed'
                      ? 'Último sync fallido — reintentar'
                      : lastSyncStatus === 'success'
                      ? 'Sincronizar — último sync correcto'
                      : 'Sincronizar actividades'
                    const syncTone =
                      syncing
                        ? 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15'
                        : lastSyncStatus === 'failed'
                        ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15'
                        : lastSyncStatus === 'success'
                        ? 'border-success/40 bg-success/10 text-success hover:bg-success/15'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                    return (
                      <button
                        onClick={handleRunDailyPipeline}
                        disabled={syncing}
                        aria-label={syncLabel}
                        className={`inline-flex h-8 items-center justify-center gap-1 rounded-md border px-2 text-[13px] transition-colors duration-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed ${syncTone}`}
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        <span className="hidden sm:inline">{syncing ? 'Sync…' : 'Sync'}</span>
                      </button>
                    )
                  })()}
                  <div className="relative" ref={userMenuRef}>
                    <button
                      onClick={() => setUserMenuOpen((o) => !o)}
                      aria-label="Menú de usuario"
                      aria-expanded={userMenuOpen}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-background px-2 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                        {(authSession.athlete?.firstname?.[0] ?? '').toUpperCase()}{(authSession.athlete?.lastname?.[0] ?? '').toUpperCase()}
                      </span>
                      <span className="hidden max-w-[120px] truncate sm:inline">
                        {authSession.athlete?.firstname} {authSession.athlete?.lastname}
                      </span>
                      <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </button>
                    {userMenuOpen && (
                      <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-md border border-border bg-background shadow-md">
                        <button
                          onClick={() => setIsDark((d) => !d)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                          {isDark ? 'Tema claro' : 'Tema oscuro'}
                        </button>
                        <div className="h-px bg-border" />
                        <button
                          onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <LogOut className="h-4 w-4" aria-hidden="true" />
                          Salir
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <button
                  onClick={handleStartStravaLogin}
                  disabled={authPending}
                  aria-label={authPending ? 'Conectando con Strava' : 'Conectar con Strava'}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground/50"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {authPending ? 'Conectando…' : 'Strava'}
                  </span>
                </button>
              )}
              {!authSession && (
                <button
                  onClick={() => setIsDark((d) => !d)}
                  aria-label={isDark ? 'Activar tema claro' : 'Activar tema oscuro'}
                  aria-pressed={isDark}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isDark ? (
                    <Sun className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Moon className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              )}
            </div>
          </header>

          <AnimatePresence>
            {authError ? (
              <motion.div
                key="auth-error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: BANNER_DURATION_S, ease: 'easeOut' }}
                className="border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-destructive lg:px-7"
              >
                {authError}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div ref={messageStreamRef} className="message-stream flex-1 space-y-2 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4 lg:px-7">
            <AnimatePresence mode="wait">
              {messages.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: EMPTY_STATE_DURATION_S, ease: 'easeOut' }}
                  className="flex h-full items-center justify-center"
                >
                  <p className="text-sm text-muted-foreground">
                    {authSession
                      ? `Hola${authSession.athlete?.firstname ? `, ${authSession.athlete.firstname}` : ''}. ¿En qué puedo ayudarte?`
                      : 'Conecta tu cuenta de Strava para comenzar.'}
                  </p>
                </motion.div>
              ) : (
                <motion.div key="messages" className="contents">
                  <AnimatePresence initial={false}>
                    {messages.map((message) => {
                      const isUser = message.role === 'user'
                      const isActiveAssistantMessage =
                        message.id === activeAssistantMessageId && requestStatus !== 'idle'
                      const hasStructuredBlocks = Boolean(message.structured?.blocks.length)
                      const hasTextContent = Boolean(message.content.trim())
                      const showSpinnerOnly = isActiveAssistantMessage && !hasStructuredBlocks && !hasTextContent

                      return (
                        <motion.article
                          key={message.id}
                          variants={isUser ? userMsgVariants : assistantMsgVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`message-bubble max-w-[min(80%,48rem)] rounded-2xl px-3 py-2 ${
                              isUser ? 'message-bubble-user' : 'message-bubble-assistant'
                            }`}
                          >
                            {showSpinnerOnly ? (
                              <BouncingDots dots={3} className="w-2 h-2 bg-foreground" />
                            ) : (
                              <div className="space-y-2">
                                {!isUser && hasStructuredBlocks ? (
                                  <PlanReactMessage
                                    blocks={message.structured?.blocks ?? []}
                                    fallbackText={message.content}
                                    isActive={isActiveAssistantMessage}
                                  />
                                ) : (
                                  isUser ? (
                                    <p className="text-sm leading-6">{message.content}</p>
                                  ) : (
                                    <div className="markdown-body text-sm">
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                                    </div>
                                  )
                                )}

                                {isActiveAssistantMessage ? (
                                  <div className="plan-react-loading-inline">
                                    <BouncingDots dots={3} className="w-1.5 h-1.5 bg-foreground/80" />
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </motion.article>
                      )
                    })}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <footer className="border-t border-border/70 px-2 py-2 sm:px-4 sm:py-3 lg:px-6">
            <RuixenPromptBox
              onSend={handleSend}
              placeholder={
                authSession
                  ? 'Preguntame por ritmo, carga, series, recuperacion o segmentos'
                  : 'Inicia sesion con Strava para habilitar el chat'
              }
              disabled={requestStatus !== 'idle' || !authSession || authPending}
              loading={requestStatus !== 'idle'}
              modelOptions={MODEL_OPTIONS}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          </footer>
        </section>
      </main>
    </div>
    </MotionConfig>
  )
}

export default App
