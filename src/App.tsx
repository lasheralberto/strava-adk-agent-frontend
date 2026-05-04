import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Brain,
  Cable,
  ChevronDown,
  ChevronRight,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Sun,
  Upload,
  X,
} from 'lucide-react'
import { ChatSidebar } from '@/components/ui/chat-sidebar'
import { useChatSessions } from '@/hooks/use-chat-sessions'
import type { ChatSessionMessage } from '@/types/chat-sessions'
import { AnimatePresence, MotionConfig, motion, type Variants } from 'motion/react'
import RuixenPromptBox from '@/components/ui/ruixen-prompt-box'
import { BouncingDots } from '@/components/ui/bouncing-dots'
import { useToasts } from '@/components/ui/toast'
import { Spinner } from '@/components/ui/spinner-1'
import { PlanReactMessage } from '@/components/ui/plan-react-message'
import { A2uiRenderer } from '@/components/ui/a2ui-renderer'
import type { A2uiPayload } from '@/types/a2ui'
import type { AgentTracePayload } from '@/types/agent-trace'
import { ActivitiesRunsPanel } from '@/components/ui/activities-runs-panel'
import { WikiKnowledgeModal } from '@/components/ui/wiki-knowledge-modal'
import { DailyReportModal } from '@/components/ui/daily-report-modal'
import { CustomizableAgentsPanel } from '@/components/ui/customizable-agents-panel'
import {
  planReactSectionOrder,
  type PlanReactBlock,
  type PlanReactSection,
  type StructuredChatContent,
} from '@/types/plan-react'
import { useLocale } from '@/hooks/use-locale'
import { useAuth } from '@/hooks/use-auth'
import AuthSwitch from '@/components/ui/auth-switch'
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
  athleteId: number | string
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




const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')
const internalPipelineToken = (import.meta.env.VITE_INTERNAL_PIPELINE_TOKEN ?? '').trim()
const DEFAULT_AGENT_ID = 'wiki_research_chat'
const MODEL_OPTIONS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
const DEFAULT_MODEL = MODEL_OPTIONS[0]
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
  const { user, loading: authLoading, error: authError, signInWithGoogle, signInWithEmail, signOut } = useAuth()

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner size={24} color="hsl(var(--muted-foreground))" />
      </div>
    )
  }

  if (!user) {
    return (
      <AuthSwitch
        onStravaLogin={() => {}}
        onGoogleLogin={signInWithGoogle}
        onEmailLogin={signInWithEmail}
        isPending={authLoading}
        error={authError}
      />
    )
  }

  return <AuthenticatedApp user={user} signOut={signOut} t={t} />
}

function AuthenticatedApp({ user, signOut, t }: { user: import('@/hooks/use-auth').AuthUser; signOut: () => void; t: ReturnType<typeof useLocale>['t'] }) {
  const [messages, setMessages] = useState(initialMessages)
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle')
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<number | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [pipelineMessage, setPipelineMessage] = useState<string>('')
  const [lastSyncStatus, setLastSyncStatus] = useState<'success' | 'failed' | 'queued' | null>(null)
  const [activitiesRefreshKey, setActivitiesRefreshKey] = useState(0)
  const [selectedAgentId, setSelectedAgentId] = useState(DEFAULT_AGENT_ID)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const [usage, setUsage] = useState<UsageSnapshot | null>(null)
  const usageLoading = false
  const [upgradePending, setUpgradePending] = useState(false)
  const [cancelPending, setCancelPending] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [planBadgeOpen, setPlanBadgeOpen] = useState(false)
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
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hubOpen, setHubOpen] = useState(false)
  const [hubView, setHubView] = useState<'menu' | 'activities'>('menu')
  const [wikiOpen, setWikiOpen] = useState(false)
  const [dailyReportOpen, setDailyReportOpen] = useState(false)
  const hubRef = useRef<HTMLDivElement>(null)
  const [connectorsOpen, setConnectorsOpen] = useState(false)
  const connectorsRef = useRef<HTMLDivElement>(null)
  const [fitUploadOpen, setFitUploadOpen] = useState(false)
  const [fitUploading, setFitUploading] = useState(false)
  const [fitUploadStatus, setFitUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [fitUploadMessage, setFitUploadMessage] = useState('')
  const [fitDragOver, setFitDragOver] = useState(false)
  const fitFileInputRef = useRef<HTMLInputElement>(null)

  const {
    sessions,
    loadingSessions,
    loadSessions,
    createSession,
    loadSessionMessages,
    addMessage,
    deleteSession,
  } = useChatSessions()

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

  useEffect(() => {
    if (!hubOpen) return
    const handleOutside = (event: MouseEvent) => {
      if (hubRef.current && !hubRef.current.contains(event.target as Node)) {
        setHubOpen(false)
      }
    }
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHubOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [hubOpen])

  useEffect(() => {
    if (!connectorsOpen) return
    const handleOutside = (event: MouseEvent) => {
      if (connectorsRef.current && !connectorsRef.current.contains(event.target as Node)) {
        setConnectorsOpen(false)
      }
    }
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConnectorsOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [connectorsOpen])

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
    if (messages.length === 0) {
      return
    }

    const container = messageStreamRef.current
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [messages, requestStatus])


  const handleRunDailyPipelineRef = useRef<(() => void) | null>(null)

  const handleFitUpload = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.name.endsWith('.fit'))
    if (fileArr.length === 0) {
      setFitUploadStatus('error')
      setFitUploadMessage('Selecciona archivos .fit válidos.')
      return
    }
    setFitUploading(true)
    setFitUploadStatus('idle')
    setFitUploadMessage('')
    setFitUploadOpen(false)

    const formData = new FormData()
    fileArr.forEach(f => formData.append('files', f))

    const headers: Record<string, string> = {}
    if (internalPipelineToken) headers['X-Internal-Token'] = internalPipelineToken

    try {
      const resp = await fetch(`${apiBaseUrl}/pipeline/fit-upload`, {
        method: 'POST',
        headers,
        body: formData,
      })
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error ?? `HTTP ${resp.status}`)
      }
      const report = await resp.json() as { activities_count?: number; run_id?: string }
      setFitUploadStatus('success')
      setFitUploadMessage(`${report.activities_count ?? fileArr.length} actividad${fileArr.length !== 1 ? 'es' : ''} en proceso. Sincronizando…`)
      setActivitiesRefreshKey(k => k + 1)
    } catch (err) {
      setFitUploadStatus('error')
      setFitUploadMessage(err instanceof Error ? err.message : 'Error al subir archivo.')
    } finally {
      setFitUploading(false)
    }
  }, [])

  const handleUpgradePlan = useCallback(async () => {
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
      const body: Record<string, unknown> = {}
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
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const backendError = await readBackendErrorMessage(response)
        throw new Error(backendError)
      }

      toasts.message({ text: 'Suscripción cancelada. Has vuelto al plan gratuito.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cancelar la suscripción.'
      toasts.error(message)
    } finally {
      setCancelPending(false)
    }
  }, [apiBaseUrl, toasts, usage?.plan?.id, usage?.planId])

  const handleRunDailyPipeline = async () => {
    if (pipelineStatus === 'running' || lastSyncStatus === 'queued') return

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
          athlete_id: user.athleteId,
          latest_limit: 10,
        }),
      })
      if (!response.ok) {
        const err = await readBackendErrorMessage(response)
        throw new Error(err)
      }

      // Stream progress via SSE until the pipeline reaches a terminal state.
      const pipelineData = (await response.json()) as { run_id?: string }
      const runId = (pipelineData.run_id ?? '').trim()

      const sseHeaders: Record<string, string> = {}
      if (internalPipelineToken) sseHeaders['X-Internal-Token'] = internalPipelineToken

      const sseRes = await fetch(
        `${apiBaseUrl}/pipeline/daily/stream?run_id=${encodeURIComponent(runId)}`,
        { headers: sseHeaders },
      )

      if (!sseRes.ok || !sseRes.body) {
        throw new Error('No se pudo conectar al stream de sincronización.')
      }

      const reader = sseRes.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let streamDone = false

      while (!streamDone) {
        const { done, value } = await reader.read()
        buf += decoder.decode(value ?? new Uint8Array(), { stream: !done })

        let idx = buf.indexOf('\n\n')
        while (idx !== -1) {
          const block = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          idx = buf.indexOf('\n\n')

          const parsed = parseSseEventBlock(block)
          if (!parsed) continue

          if (parsed.event === 'progress') {
            const payload = JSON.parse(parsed.data) as { stage: string; message: string }
            setPipelineMessage(payload.message)
            if (payload.stage === 'error') {
              toasts.error(payload.message || 'Error en la sincronización.')
              setLastSyncStatus('failed')
              setPipelineStatus('error')
              setTimeout(() => { setPipelineStatus('idle'); setPipelineMessage('') }, 3000)
              streamDone = true
              break
            }
          }

          if (parsed.event === 'done') {
            const payload = JSON.parse(parsed.data) as { status?: string; message?: string }
            if (payload.status === 'error') {
              toasts.error(payload.message || 'Error en la sincronización.')
              setLastSyncStatus('failed')
              setPipelineStatus('error')
              setTimeout(() => { setPipelineStatus('idle'); setPipelineMessage('') }, 3000)
            } else {
              toasts.success('Sincronizacion completada.')
              setLastSyncStatus('success')
              setPipelineStatus('success')
              setActivitiesRefreshKey((k) => k + 1)
              setTimeout(() => { setPipelineStatus('idle'); setPipelineMessage('') }, 3000)
            }
            streamDone = true
            break
          }
        }

        if (done) break
      }

      if (!streamDone) {
        // Stream closed without a terminal SSE event — treat as failure
        setLastSyncStatus('failed')
        setPipelineStatus('error')
        setTimeout(() => { setPipelineStatus('idle'); setPipelineMessage('') }, 3000)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error ejecutando pipeline.'
      toasts.error(message)
      setLastSyncStatus('failed')
      setPipelineStatus('error')
      setTimeout(() => { setPipelineStatus('idle'); setPipelineMessage('') }, 3000)
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
    const loaded: ChatSessionMessage[] = await loadSessionMessages(user?.athleteId ?? '', sessionId)
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
  }, [loadSessionMessages, user])

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await deleteSession(user?.athleteId ?? '', sessionId)
    if (currentSessionId === sessionId) {
      setMessages([])
      setCurrentSessionId(null)
    }
  }, [deleteSession, currentSessionId, user])

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

    const assistantMessageId = Date.now() + 1
    setRequestStatus('requesting')
    setActiveAssistantMessageId(assistantMessageId)
    let chatErrorToastShown = false

    try {
      let streamedResponse = ''
      let accumulatedBlocks: PlanReactBlock[] = []
      let streamedA2ui: A2uiPayload | undefined
      let streamedAgentTrace: AgentTracePayload | undefined

      setMessages((currentMessages) =>
        updateAssistantMessage(currentMessages, assistantMessageId, '', transform ?? 'Streaming'),
      )

      let response = await fetch(`${apiBaseUrl}/chat/wiki`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: requestMessage,
          stream: true,
          athlete_id: user.athleteId,
          agent_id: selectedAgentId,
          model: model || DEFAULT_MODEL,
          session_id: currentSessionId,
        }),
      })

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

        throw new Error(errorPayload.error ?? errorPayload.details ?? errorPayload.message ?? 'No se pudo obtener respuesta del backend.')
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
      finalAssistantContentRef.current = null
    }
  }

  const hasUsageRemaining = usage ? usage.usageMessagesRemaining > 0 : true
  const currentPlanId = (usage?.plan?.id ?? usage?.planId ?? '').trim().toLowerCase()
  const isFreePlan = !usage || currentPlanId === 'free' || currentPlanId === ''

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
              <>
                  <div className="flex items-center gap-2">
                  <WikiKnowledgeModal
                    athleteId={user.athleteId}
                    apiBaseUrl={apiBaseUrl}
                    open={wikiOpen}
                    onOpenChange={setWikiOpen}
                  />
                  <DailyReportModal
                    athleteId={user.athleteId}
                    apiBaseUrl={apiBaseUrl}
                    internalToken={internalPipelineToken}
                    open={dailyReportOpen}
                    onOpenChange={setDailyReportOpen}
                  />
                  <div ref={hubRef} className="relative">
                    <button
                      type="button"
                      onClick={() => { setHubOpen((o) => !o); setHubView('menu') }}
                      aria-label="Knowledge hub"
                      aria-expanded={hubOpen}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Brain className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <AnimatePresence>
                      {hubOpen && (
                        <motion.div
                          key="hub-popover"
                          initial={{ opacity: 0, y: 4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 2, scale: 0.97 }}
                          transition={{ duration: 0.12, ease: 'easeOut' }}
                          className="absolute right-0 top-full z-50 mt-1 w-[220px] overflow-hidden rounded-xl border border-white/[0.08] bg-popover shadow-xl"
                          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.36), 0 0 0 1px rgba(255,255,255,0.06)' }}
                        >
                          {hubView === 'menu' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => { setHubOpen(false); setWikiOpen(true) }}
                                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-foreground transition-colors hover:bg-muted"
                              >
                                <Brain className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                                Knowledge base
                              </button>
                              <div className="h-px bg-border" />
                              <button
                                type="button"
                                onClick={() => { setHubOpen(false); setDailyReportOpen(true) }}
                                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-foreground transition-colors hover:bg-muted"
                              >
                                <Brain className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                Tu resumen
                              </button>
                              <div className="h-px bg-border" />
                              <button
                                type="button"
                                onClick={() => setHubView('activities')}
                                className="flex w-full items-center justify-between gap-2.5 px-3 py-2.5 text-[13px] text-foreground transition-colors hover:bg-muted"
                              >
                                <span className="flex items-center gap-2.5">
                                  <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                  Actividades indexadas
                                </span>
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                              </button>
                            </>
                          ) : (
                            <ActivitiesRunsPanel
                              athleteId={user.athleteId}
                              refreshKey={activitiesRefreshKey}
                              inlineMode
                              active={hubView === 'activities'}
                            />
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div ref={connectorsRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setConnectorsOpen((o) => !o)}
                      aria-label="Conectores"
                      aria-expanded={connectorsOpen}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Cable className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <AnimatePresence>
                      {connectorsOpen && (
                        <motion.div
                          key="connectors-popover"
                          initial={{ opacity: 0, y: 4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 2, scale: 0.97 }}
                          transition={{ duration: 0.12, ease: 'easeOut' }}
                          className="absolute right-0 top-full z-50 mt-1 w-[240px] overflow-hidden rounded-xl border border-white/[0.08] bg-popover shadow-xl"
                          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.36), 0 0 0 1px rgba(255,255,255,0.06)' }}
                        >
                          <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Conectores
                          </div>
                          <div className="h-px bg-border" />
                          <div className="flex items-center gap-1 px-2 py-1.5">
                            {(() => {
                              const _syncing = pipelineStatus === 'running' || lastSyncStatus === 'queued'
                              const _color = _syncing ? 'text-warning' : lastSyncStatus === 'failed' ? 'text-destructive' : lastSyncStatus === 'success' ? 'text-success' : 'text-muted-foreground'
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleRunDailyPipeline()}
                                  disabled={_syncing}
                                  title={_syncing ? (pipelineMessage || t.header.syncing) : t.header.sync}
                                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted disabled:cursor-not-allowed ${_color}`}
                                >
                                  <RefreshCw className={`h-3.5 w-3.5 ${_syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                                </button>
                              )
                            })()}
                          </div>
                          <div className="h-px bg-border" />
                          <button
                            type="button"
                            onClick={() => { if (fitUploading) return; setConnectorsOpen(false); setFitUploadStatus('idle'); setFitUploadMessage(''); setFitUploadOpen(true) }}
                            disabled={fitUploading}
                            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors hover:bg-muted disabled:cursor-not-allowed ${fitUploading ? 'text-warning' : 'text-foreground'}`}
                          >
                            {fitUploading
                              ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                              : <Upload className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                            {fitUploading ? 'Subiendo actividad…' : 'Importar actividad manual (.fit)'}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <CustomizableAgentsPanel
                    isDark={isDark}
                    athleteId={user.athleteId}
                    selectedAgentId={selectedAgentId}
                    onAgentChange={setSelectedAgentId}
                    isFreePlan={isFreePlan}
                    onUpgrade={() => void handleUpgradePlan()}
                    upgradePending={upgradePending}
                  />
                  </div>
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
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    aria-label="Cerrar sesión"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.03] text-muted-foreground transition-colors duration-100 hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
            </div>
          </header>

          <div className="chat-canvas flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={messageStreamRef} className="message-stream flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-[7%] sm:py-10">
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
                    {t.chat.connectToStart}
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

          <footer className="border-t border-white/[0.06] px-2.5 py-2 sm:px-[5%] sm:py-4">
            <RuixenPromptBox
              onSend={handleSend}
              placeholder={hasUsageRemaining ? t.chat.placeholder : t.chat.limitReached}
              disabled={requestStatus !== 'idle' || !hasUsageRemaining}
              loading={requestStatus !== 'idle'}
              modelOptions={MODEL_OPTIONS}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              modelLeftSlot={
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
                            className="absolute bottom-full left-0 z-50 mb-2 w-[min(280px,calc(100vw-1.5rem))] rounded-xl border border-border bg-background p-3 shadow-md"
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
              }
            />
          </footer>
          </div>{/* /chat-canvas */}
        </section>
      </main>
    </div>

    {/* FIT upload modal */}
    <AnimatePresence>
      {fitUploadOpen && (
        <motion.div
          key="fit-upload-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) { setFitUploadOpen(false) } }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-card shadow-2xl"
            style={{ boxShadow: '0 8px 48px rgba(0,0,0,0.48), 0 0 0 1px rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="text-[14px] font-semibold text-foreground">Importar actividad .fit</span>
              </div>
              <button
                type="button"
                onClick={() => setFitUploadOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5">
              <div
                onDragOver={(e) => { e.preventDefault(); setFitDragOver(true) }}
                onDragLeave={() => setFitDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setFitDragOver(false)
                  void handleFitUpload(e.dataTransfer.files)
                }}
                onClick={() => fitFileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${fitDragOver ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50'}`}
              >
                <Upload className={`h-8 w-8 ${fitDragOver ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                <div className="text-center">
                  <p className="text-[13px] font-medium text-foreground">Arrastra archivos .fit aquí</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">o haz clic para seleccionar</p>
                </div>
                <input
                  ref={fitFileInputRef}
                  type="file"
                  accept=".fit"
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.length) void handleFitUpload(e.target.files) }}
                />
              </div>

              {fitUploading && (
                <div className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Spinner size={14} color="hsl(var(--muted-foreground))" />
                  <span>Procesando actividades…</span>
                </div>
              )}

              {!fitUploading && fitUploadStatus === 'success' && (
                <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-[13px] text-green-400">
                  {fitUploadMessage}
                </div>
              )}

              {!fitUploading && fitUploadStatus === 'error' && (
                <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive">
                  {fitUploadMessage}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </MotionConfig>
  )
}

export default App
