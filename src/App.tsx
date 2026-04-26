import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ChevronDown,
  LogIn,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
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
import { useToasts } from '@/components/ui/toast'
import { Spinner } from '@/components/ui/spinner-1'
import { PlanReactMessage } from '@/components/ui/plan-react-message'
import { A2uiRenderer } from '@/components/ui/a2ui-renderer'
import type { A2uiPayload } from '@/types/a2ui'
import type { AgentTracePayload } from '@/types/agent-trace'
import { ActivitiesRunsPanel } from '@/components/ui/activities-runs-panel'
import { CustomizableAgentsPanel } from '@/components/ui/customizable-agents-panel'
import {
  planReactSectionOrder,
  type PlanReactBlock,
  type PlanReactSection,
  type StructuredChatContent,
} from '@/types/plan-react'
import { parse as parseToml } from 'smol-toml'
import { useLocale } from '@/hooks/use-locale'
import './styles/chat.css'

// ── Animation constants ───────────────────────────────────────────────────────
const MSG_SLIDE_Y_PX = 10
const MSG_SLIDE_X_USER_PX = 8
const MSG_SPRING = { type: 'spring' as const, stiffness: 360, damping: 28, mass: 0.8 }
const MSG_EXIT_DURATION_S = 0.12
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
  a2ui?: A2uiPayload
  agentTrace?: AgentTracePayload
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
  _event?: string
  a2ui?: A2uiPayload
  agent_trace?: AgentTracePayload
}

type UsagePlan = {
  id: string
  name: string
  usageMessagesDailyMax: number
  renewMessagesUsageEvery: string
  description: string
  features: string[]
  price_id?: string
}

type UsageSnapshot = {
  athleteId: number
  planId: string
  plan?: UsagePlan
  usageMessagesUsed: number
  usageMessagesRemaining: number
  usageMessagesDailyMax: number
  renewMessagesUsageEvery?: string
  usagePeriodStartedAt?: string
  usagePeriodEndsAt?: string
  usageLastMessageAt?: string | null
  usageMessagesTotal?: number
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

function updateAssistantA2ui(
  currentMessages: ChatMessage[],
  messageId: number,
  a2ui: A2uiPayload,
): ChatMessage[] {
  return currentMessages.map((message) =>
    message.id === messageId ? { ...message, a2ui } : message,
  )
}

function updateAssistantAgentTrace(
  currentMessages: ChatMessage[],
  messageId: number,
  agentTrace: AgentTracePayload,
): ChatMessage[] {
  return currentMessages.map((message) =>
    message.id === messageId ? { ...message, agentTrace } : message,
  )
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

function formatUsageDate(isoString?: string): string {
  if (!isoString) {
    return 'Sin fecha'
  }

  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha'
  }

  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function App() {
  const { t } = useLocale()
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
  const [usage, setUsage] = useState<UsageSnapshot | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [upgradePending, setUpgradePending] = useState(false)
  const [cancelPending, setCancelPending] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [planBadgeOpen, setPlanBadgeOpen] = useState(false)
  const authSessionRef = useRef<StravaAuthSession | null>(authSession)
  const refreshInFlightRef = useRef<Promise<StravaAuthSession | null> | null>(null)
  const messageStreamRef = useRef<HTMLDivElement | null>(null)
  const finalAssistantContentRef = useRef<{ content: string; tag: string; structured?: import('@/types/plan-react').StructuredChatContent; a2ui?: A2uiPayload; agentTrace?: AgentTracePayload } | null>(null)
  const planBadgeRef = useRef<HTMLDivElement | null>(null)
  const toasts = useToasts()
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const initialSyncDoneRef = useRef(false)
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
    if (!userMenuOpen) {
      setCancelConfirm(false)
      return
    }
    const handle = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('click', handle)
    return () => document.removeEventListener('click', handle)
  }, [userMenuOpen])

  useEffect(() => {
    if (!planBadgeOpen) {
      setCancelConfirm(false)
      return
    }

    const handleOutside = (event: MouseEvent) => {
      if (planBadgeRef.current && !planBadgeRef.current.contains(event.target as Node)) {
        setPlanBadgeOpen(false)
      }
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPlanBadgeOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEsc)

    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [planBadgeOpen])

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const checkoutStatus = url.searchParams.get('checkout_status')
    if (!checkoutStatus) return

    url.searchParams.delete('checkout_status')
    url.searchParams.delete('session_id')
    window.history.replaceState({}, document.title, url.toString())

    if (checkoutStatus === 'success') {
      toasts.success('¡Suscripción activada! Bienvenido a Athly Pro.')
      const athleteId = authSessionRef.current?.athlete?.id
      if (athleteId) {
        setTimeout(() => void fetchUsage(athleteId), 2500)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const fetchUsage = useCallback(
    async (athleteId: number) => {
      if (!apiBaseUrl || !athleteId) {
        setUsageLoading(false)
        return
      }

      setUsageLoading(true)

      try {
        const response = await fetch(`${apiBaseUrl}/usage/${athleteId}`)
        if (!response.ok) return
        const payload = (await response.json()) as UsageSnapshot
        setUsage(payload)
      } catch {
        // silently ignore usage read failures
      } finally {
        setUsageLoading(false)
      }
    },
    [apiBaseUrl],
  )

  useEffect(() => {
    if (authSession?.athlete?.id) {
      fetchIndexingStatus()
    } else {
      setLastSyncStatus(null)
    }
  }, [authSession, fetchIndexingStatus])

  useEffect(() => {
    if (authSession?.athlete?.id) {
      fetchUsage(authSession.athlete.id)
    } else {
      setUsage(null)
      setPlanBadgeOpen(false)
      setUsageLoading(false)
    }
  }, [authSession, fetchUsage])

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

  const handleRunDailyPipelineRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (authSession?.athlete?.id && !initialSyncDoneRef.current) {
      initialSyncDoneRef.current = true
      // small delay so session state settles before sync starts
      const t = setTimeout(() => handleRunDailyPipelineRef.current?.(), 500)
      return () => clearTimeout(t)
    }
    if (!authSession) {
      initialSyncDoneRef.current = false
    }
  }, [authSession])

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
    setUsage(null)
    setPlanBadgeOpen(false)
    setUsageLoading(false)
    setUpgradePending(false)
  }

  const handleUpgradePlan = useCallback(async () => {
    const athleteId = authSessionRef.current?.athlete?.id
    if (!athleteId) {
      toasts.warning('No hay una sesión activa para actualizar el plan.')
      return
    }

    const currentPlanId = (usage?.plan?.id ?? usage?.planId ?? '').trim().toLowerCase()
    if (currentPlanId !== 'free') {
      return
    }

    if (!apiBaseUrl) {
      toasts.error('El servicio no está disponible en este momento.')
      return
    }

    setUpgradePending(true)

    try {
      const body: Record<string, unknown> = { athlete_id: athleteId }
      const planPriceId = usage?.plan?.price_id
      if (typeof planPriceId === 'string' && planPriceId) {
        body.price_id = planPriceId
      }

      const response = await fetch(`${apiBaseUrl}/billing/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const backendError = await readBackendErrorMessage(response)
        throw new Error(backendError)
      }

      const { checkout_url } = (await response.json()) as { checkout_url: string }
      window.location.href = checkout_url
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar el pago.'
      toasts.error(message)
      setUpgradePending(false)
    }
  }, [apiBaseUrl, toasts, usage?.plan?.id, usage?.planId])

  const handleCancelSubscription = useCallback(async () => {
    const athleteId = authSessionRef.current?.athlete?.id
    if (!athleteId) {
      toasts.warning('No hay una sesión activa.')
      return
    }

    const currentPlanId = (usage?.plan?.id ?? usage?.planId ?? '').trim().toLowerCase()
    if (currentPlanId === 'free') {
      return
    }

    if (!apiBaseUrl) {
      toasts.error('El servicio no está disponible en este momento.')
      return
    }

    setCancelPending(true)
    setCancelConfirm(false)

    try {
      const response = await fetch(`${apiBaseUrl}/billing/cancel-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athlete_id: athleteId }),
      })

      if (!response.ok) {
        const backendError = await readBackendErrorMessage(response)
        throw new Error(backendError)
      }

      toasts.message({ text: 'Suscripción cancelada. Has vuelto al plan gratuito.' })
      await fetchUsage(athleteId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cancelar la suscripción.'
      toasts.error(message)
    } finally {
      setCancelPending(false)
    }
  }, [apiBaseUrl, toasts, usage?.plan?.id, usage?.planId, fetchUsage])

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
          toasts.error('La sincronizacion excedio el tiempo esperado.')
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
              toasts.success('Sincronizacion completada.')
              setLastSyncStatus('success')
              setPipelineStatus('success')
              setActivitiesRefreshKey((k) => k + 1)
              setTimeout(() => setPipelineStatus('idle'), 3000)
              return
            }

            if (runStatus === 'skipped') {
              toasts.message({ text: 'No hay actividades nuevas para sincronizar.' })
              setLastSyncStatus(null)
              setPipelineStatus('idle')
              return
            }

            if (runStatus === 'failed' || runStatus === 'partial_failure') {
              toasts.error('La sincronizacion fallo. Intenta de nuevo en unos minutos.')
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
      toasts.error(message)
      setAuthError(message)
      setLastSyncStatus('failed')
      setPipelineStatus('error')
      setTimeout(() => setPipelineStatus('idle'), 3000)
    }
  }

  // keep ref in sync so the startup useEffect can call it without stale closure
  handleRunDailyPipelineRef.current = handleRunDailyPipeline

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
      agentTrace: m.agentTrace,
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

    if (usage && usage.usageMessagesRemaining <= 0) {
      const planLabel = usage.plan?.name ?? usage.planId
      const limitMessage = `Has alcanzado tu limite diario de mensajes (${usage.usageMessagesUsed}/${usage.usageMessagesDailyMax}) en el plan ${planLabel}.`
      toasts.warning(limitMessage)
      setMessages((currentMessages) => [
        ...currentMessages,
        buildAssistantMessage(limitMessage, 'Limite de uso'),
      ])
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
      toasts.warning('Inicia sesion con Strava para comenzar.')
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
      toasts.error('El servicio no esta disponible en este momento.')
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
    let chatErrorToastShown = false

    try {
      let session = await ensureValidStravaSession()
      if (!session) {
        throw new Error('No hay sesion Strava activa. Inicia sesion para continuar.')
      }

      let streamedResponse = ''
      let accumulatedBlocks: PlanReactBlock[] = []
      let streamedA2ui: A2uiPayload | undefined
      let streamedAgentTrace: AgentTracePayload | undefined

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
          usage?: UsageSnapshot
        }

        if (response.status === 429 && errorPayload.error === 'usage_limit_exceeded') {
          if (errorPayload.usage) {
            setUsage(errorPayload.usage)
          }
          const usagePayload = errorPayload.usage
          const limitMessage = usagePayload
            ? `Has alcanzado tu limite diario (${usagePayload.usageMessagesUsed}/${usagePayload.usageMessagesDailyMax}).`
            : 'Has alcanzado tu limite diario de mensajes.'
          toasts.warning(limitMessage)
          chatErrorToastShown = true
          throw new Error(limitMessage)
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
            const retriedErrorPayload = (await response.json().catch(() => ({}))) as {
              error?: string
              details?: string
              message?: string
              usage?: UsageSnapshot
            }

            if (response.status === 429 && retriedErrorPayload.error === 'usage_limit_exceeded') {
              if (retriedErrorPayload.usage) {
                setUsage(retriedErrorPayload.usage)
              }
              const usagePayload = retriedErrorPayload.usage
              const limitMessage = usagePayload
                ? `Has alcanzado tu limite diario (${usagePayload.usageMessagesUsed}/${usagePayload.usageMessagesDailyMax}).`
                : 'Has alcanzado tu limite diario de mensajes.'
              toasts.warning(limitMessage)
              chatErrorToastShown = true
              throw new Error(limitMessage)
            }

            backendError =
              retriedErrorPayload.error ??
              retriedErrorPayload.details ??
              retriedErrorPayload.message ??
              'No se pudo obtener respuesta del backend.'
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
        const finalText = (payload.response ?? '').trim() || t.chat.backendEmpty
        const nonStreamA2ui = payload.a2ui
        const nonStreamAgentTrace = payload.agent_trace
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

          if (nonStreamA2ui) {
            nextMessages = updateAssistantA2ui(nextMessages, assistantMessageId, nonStreamA2ui)
          }

          if (nonStreamAgentTrace) {
            nextMessages = updateAssistantAgentTrace(nextMessages, assistantMessageId, nonStreamAgentTrace)
          }

          return nextMessages
        })
        const nonStreamFinalText = (payload.response ?? '').trim() || t.chat.backendEmpty
        finalAssistantContentRef.current = {
          content: nonStreamFinalText,
          tag: transform ?? 'Respuesta',
          structured: structuredBlocks.length > 0 ? { format: 'plan_react_v1', blocks: structuredBlocks } : undefined,
          a2ui: nonStreamA2ui,
          agentTrace: nonStreamAgentTrace,
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

            if (parsedEvent.event === 'a2ui' && payload.a2ui) {
              streamedA2ui = payload.a2ui
              setMessages((currentMessages) =>
                updateAssistantA2ui(currentMessages, assistantMessageId, payload.a2ui!),
              )
              boundaryIndex = buffer.indexOf('\n\n')
              continue
            }

            if (parsedEvent.event === 'agent_trace' && payload.agent_trace) {
              streamedAgentTrace = payload.agent_trace
              setMessages((currentMessages) =>
                updateAssistantAgentTrace(currentMessages, assistantMessageId, payload.agent_trace!),
              )
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

      const finalText = streamedResponse.trim() || t.chat.backendEmpty
      setMessages((currentMessages) =>
        updateAssistantMessage(currentMessages, assistantMessageId, finalText, transform ?? 'Respuesta'),
      )
      finalAssistantContentRef.current = {
        content: finalText,
        tag: transform ?? 'Respuesta',
        structured: accumulatedBlocks.length > 0 ? { format: 'plan_react_v1', blocks: accumulatedBlocks } : undefined,
        a2ui: streamedA2ui,
        agentTrace: streamedAgentTrace,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t.chat.unexpectedError
      if (!chatErrorToastShown) {
        toasts.error(message)
      }
      setMessages((currentMessages) =>
        updateAssistantMessage(currentMessages, assistantMessageId, message, 'Error'),
      )
      finalAssistantContentRef.current = { content: message, tag: 'Error' }
    } finally {
      setRequestStatus('idle')
      setActiveAssistantMessageId(null)
      // Persist final assistant message to Firestore
      if (athleteId && activeSessionId && finalAssistantContentRef.current) {
        const { content, tag, structured, agentTrace } = finalAssistantContentRef.current
        void addMessage({
          athleteId,
          sessionId: activeSessionId,
          messageId: String(assistantMessageId),
          role: 'assistant',
          content,
          tag,
          structured,
          agentTrace,
        })
        finalAssistantContentRef.current = null
      }
      if (athleteId) {
        void fetchUsage(athleteId)
      }
    }
  }

  const hasUsageRemaining = usage ? usage.usageMessagesRemaining > 0 : true
  const currentPlanId = (usage?.plan?.id ?? usage?.planId ?? '').trim().toLowerCase()
  const isFreePlan = currentPlanId === 'free'

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
          <header className="relative z-10 flex h-[60px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-card/60 px-3 backdrop-blur-md sm:gap-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label={t.header.openSessions}
                className="mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.03] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>

            </div>
            <div className="flex flex-wrap items-center gap-2">
              {authSession ? (
                <>
                  <div className="flex items-center gap-2">
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
                  </div>
                  <div className="relative" ref={userMenuRef}>
                    {(() => {
                      const syncing = pipelineStatus === 'running' || lastSyncStatus === 'queued'
                      const syncIconColor = syncing
                        ? 'text-warning'
                        : lastSyncStatus === 'failed'
                        ? 'text-destructive'
                        : lastSyncStatus === 'success'
                        ? 'text-success'
                        : 'text-muted-foreground'
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => setUserMenuOpen((o) => !o)}
                            aria-label={t.header.userMenu}
                            aria-expanded={userMenuOpen}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.03] px-3 text-[13px] font-medium text-foreground transition-colors duration-100 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 shrink-0 ${syncIconColor} ${syncing ? 'animate-spin' : ''}`}
                              aria-hidden="true"
                            />
                            <span
                              className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #6366f1 100%)' }}
                            >
                              {(authSession.athlete?.firstname?.[0] ?? '').toUpperCase()}{(authSession.athlete?.lastname?.[0] ?? '').toUpperCase()}
                            </span>
                            <span className="hidden max-w-[120px] truncate sm:inline">
                              {authSession.athlete?.firstname} {authSession.athlete?.lastname}
                            </span>
                            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
                          </button>
                          {userMenuOpen && (
                            <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-white/[0.08] bg-popover shadow-xl" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.36), 0 0 0 1px rgba(255,255,255,0.06)' }}>
                              <button
                                type="button"
                                onClick={() => { setUserMenuOpen(false); handleRunDailyPipeline() }}
                                disabled={syncing}
                                className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors hover:bg-muted disabled:cursor-not-allowed ${syncIconColor}`}
                              >
                                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                                {syncing ? t.header.syncing : lastSyncStatus === 'failed' ? t.header.retrySync : t.header.sync}
                              </button>
                              <div className="h-px bg-border" />
                              <div className="px-3 py-2">
                                <div className="flex items-center justify-between gap-2 text-[12px]">
                                  <span className="text-muted-foreground">{t.header.currentPlan}</span>
                                  {usageLoading ? (
                                    <span
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-background"
                                        aria-label={t.plan.loadingPlan}
                                    >
                                      <Spinner size={9} color="hsl(var(--muted-foreground) / 0.85)" />
                                    </span>
                                  ) : (
                                    <span className="inline-flex max-w-[120px] truncate rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground">
                                      {usage?.plan?.name ?? usage?.planId ?? '—'}
                                    </span>
                                  )}
                                </div>
                                {isFreePlan ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleUpgradePlan()}
                                    disabled={upgradePending || usageLoading}
                                    className="mt-2 inline-flex h-7 w-full items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {upgradePending ? t.header.upgrading : t.header.upgrade}
                                  </button>
                                ) : (
                                  cancelConfirm ? (
                                    <div className="mt-2 flex gap-1">
                                      <button
                                        type="button"
                                        onClick={() => void handleCancelSubscription()}
                                        disabled={cancelPending}
                                        className="inline-flex h-7 flex-1 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {cancelPending ? t.header.canceling : t.header.confirmCancel}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setCancelConfirm(false)}
                                        disabled={cancelPending}
                                        className="inline-flex h-7 flex-1 items-center justify-center rounded-md border border-border bg-muted/50 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed"
                                      >
                                        {t.header.no}
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setCancelConfirm(true)}
                                      className="mt-2 inline-flex h-7 w-full items-center justify-center rounded-md border border-border/40 bg-muted/10 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {t.header.switchToFree}
                                    </button>
                                  )
                                )}
                              </div>
                              <div className="h-px bg-border" />
                              <button
                                type="button"
                                onClick={() => setIsDark((d) => !d)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                                {isDark ? t.header.lightTheme : t.header.darkTheme}
                              </button>
                              <div className="h-px bg-border" />
                              <button
                                type="button"
                                onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <LogOut className="h-4 w-4" aria-hidden="true" />
                                {t.header.logout}
                              </button>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleStartStravaLogin}
                  disabled={authPending}
                  aria-label={authPending ? t.header.connectingSTRAVA : t.header.connectSTRAVA}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.03] px-3 text-[13px] font-medium text-foreground transition-colors duration-100 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {authPending ? t.header.connecting : 'Strava'}
                  </span>
                </button>
              )}
              {!authSession && (
                <button
                  type="button"
                  onClick={() => setIsDark((d) => !d)}
                  aria-label={isDark ? t.header.activateLightTheme : t.header.activateDarkTheme}
                  aria-pressed={isDark}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.03] text-muted-foreground transition-colors duration-100 hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

          <div className="chat-canvas flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={messageStreamRef} className="message-stream flex-1 space-y-2 overflow-y-auto px-4 py-8 sm:px-[7%] sm:py-10">
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
                      ? t.chat.greeting(authSession.athlete?.firstname)
                      : t.chat.connectToStart}
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

                                {!isUser && message.a2ui ? (
                                  <A2uiRenderer payload={message.a2ui} />
                                ) : null}

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

          <footer className="border-t border-white/[0.06] px-3 py-3 sm:px-[5%] sm:py-4">
            <RuixenPromptBox
              onSend={handleSend}
              placeholder={
                authSession
                  ? hasUsageRemaining
                    ? t.chat.placeholder
                    : t.chat.limitReached
                  : t.chat.loginToChat
              }
              disabled={requestStatus !== 'idle' || !authSession || authPending || !hasUsageRemaining}
              loading={requestStatus !== 'idle'}
              modelOptions={MODEL_OPTIONS}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              modelLeftSlot={
                authSession ? (
                  usageLoading ? (
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background"
                      aria-label={t.plan.loadingPlan}
                    >
                      <Spinner size={10} color="hsl(var(--muted-foreground) / 0.85)" />
                    </span>
                  ) : usage ? (
                    <div ref={planBadgeRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setPlanBadgeOpen((open) => !open)}
                        aria-expanded={planBadgeOpen}
                        aria-haspopup="dialog"
                        className="inline-flex h-7 max-w-[240px] items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="truncate">Plan {usage.plan?.name ?? usage.planId}</span>
                        <ChevronDown
                          className={`h-3 w-3 shrink-0 transition-transform ${planBadgeOpen ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </button>

                      <AnimatePresence>
                        {planBadgeOpen ? (
                          <motion.div
                            key="plan-usage-popover"
                            initial={{ opacity: 0, y: 6, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.98 }}
                            transition={{ duration: 0.14, ease: 'easeOut' }}
                            role="dialog"
                            aria-label={t.plan.planDetail}
                            className="absolute bottom-full right-0 z-50 mb-2 w-[280px] rounded-xl border border-border bg-background p-3 shadow-md"
                          >
                            <div className="space-y-2.5">
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.plan.activePlan}</p>
                                <div className="mt-0.5 flex items-center justify-between gap-2">
                                  <p className="truncate text-sm font-semibold text-foreground">
                                    {usage.plan?.name ?? usage.planId}
                                  </p>
                                  {isFreePlan ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleUpgradePlan()}
                                      disabled={upgradePending || usageLoading}
                                      className="inline-flex h-6 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 px-2 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {upgradePending ? t.plan.upgrading : t.plan.upgrade}
                                    </button>
                                  ) : cancelConfirm ? (
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        onClick={() => void handleCancelSubscription()}
                                        disabled={cancelPending}
                                        className="inline-flex h-6 shrink-0 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 px-2 text-[10px] font-semibold text-destructive transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {cancelPending ? t.plan.canceling : t.plan.confirm}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setCancelConfirm(false)}
                                        disabled={cancelPending}
                                        className="inline-flex h-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 px-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted"
                                      >
                                        {t.plan.no}
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setCancelConfirm(true)}
                                      disabled={cancelPending || usageLoading}
                                      className="inline-flex h-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 px-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {t.plan.cancelPro}
                                    </button>
                                  )}
                                </div>
                                {usage.plan?.description ? (
                                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                                    {usage.plan.description}
                                  </p>
                                ) : null}
                              </div>

                              <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-2">
                                <div className="text-center">
                                  <p className="text-[10px] text-muted-foreground">{t.plan.used}</p>
                                  <p className="text-sm font-semibold text-foreground">{usage.usageMessagesUsed}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[10px] text-muted-foreground">{t.plan.limit}</p>
                                  <p className="text-sm font-semibold text-foreground">{usage.usageMessagesDailyMax}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[10px] text-muted-foreground">{t.plan.remaining}</p>
                                  <p className="text-sm font-semibold text-foreground">{usage.usageMessagesRemaining}</p>
                                </div>
                              </div>

                              <div className="rounded-md border border-border/70 px-2 py-1.5 text-[11px] text-muted-foreground">
                                {t.plan.renewsOn} {formatUsageDate(usage.usagePeriodEndsAt)}
                              </div>

                              {usage.plan?.features?.length ? (
                                <div className="rounded-md border border-border/70 px-2 py-1.5">
                                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.plan.includes}</p>
                                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                                    {usage.plan.features.slice(0, 4).map((feature) => (
                                      <li key={feature}>{feature}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  ) : null
                ) : null
              }
            />
          </footer>
          </div>{/* /chat-canvas */}
        </section>
      </main>
    </div>
    </MotionConfig>
  )
}

export default App
