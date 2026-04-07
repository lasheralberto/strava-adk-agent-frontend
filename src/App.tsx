import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import {
  CircleCheck,
  LogIn,
  Moon,
  ShieldAlert,
  Sun,
} from 'lucide-react'
import RuixenPromptBox from '@/components/ui/ruixen-prompt-box'
import { BouncingDots } from '@/components/ui/bouncing-dots'
import { PlanReactMessage } from '@/components/ui/plan-react-message'
import {
  planReactSectionOrder,
  type PlanReactBlock,
  type PlanReactSection,
  type StructuredChatContent,
} from '@/types/plan-react'
import './styles/chat.css'

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
const llmProvider = (import.meta.env.VITE_LLM_PROVIDER ?? '').trim()
const stravaScope = (import.meta.env.VITE_STRAVA_SCOPE ?? 'read,activity:read_all,profile:read_all').trim()
const localStorageAuthKey = 'strava_oauth_session_v1'
const planReactPhaseEvents = new Set<PlanReactSection>(planReactSectionOrder)

const planReactOrderIndex = planReactSectionOrder.reduce(
  (accumulator, section, index) => {
    accumulator[section] = index
    return accumulator
  },
  {} as Record<PlanReactSection, number>,
)

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: 'assistant',
    title: 'Toontracks',
    content:
      'Ya conecte tus actividades. Te ayudo a leer carga, ritmo y recuperacion con recomendaciones faciles y accionables.',
    tag: 'Inicio',
  },
  {
    id: 2,
    role: 'assistant',
    title: 'Tip rapido',
    content:
      'Si quieres, empezamos con resumen semanal, zonas de esfuerzo o un plan express para tu proximo entreno.',
    tag: 'Sugerencia',
  },
]

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
    title: 'Toontracks',
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
      title: 'Toontracks',
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
      title: 'Toontracks',
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

  const raw = localStorage.getItem(localStorageAuthKey)
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
    localStorage.removeItem(localStorageAuthKey)
    return
  }

  localStorage.setItem(localStorageAuthKey, JSON.stringify(session))
}

function App() {
  const [messages, setMessages] = useState(initialMessages)
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle')
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<number | null>(null)
  const [authSession, setAuthSession] = useState<StravaAuthSession | null>(() => readStoredSession())
  const [authPending, setAuthPending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const authSessionRef = useRef<StravaAuthSession | null>(authSession)
  const refreshInFlightRef = useRef<Promise<StravaAuthSession | null> | null>(null)
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    authSessionRef.current = authSession
  }, [authSession])

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

      authSessionRef.current = refreshed
      setAuthSession(refreshed)
      writeStoredSession(refreshed)
      return refreshed
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
  }

  const handleSend = async ({ message, transform }: { message: string; transform: string | null }) => {
    const isSending = requestStatus !== 'idle'
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
          'Primero inicia sesion con Strava para habilitar el chat y acceder a tus actividades.',
          'Autenticacion requerida',
        ),
      ])
      return
    }

    if (!apiBaseUrl) {
      setMessages((currentMessages) => [
        ...currentMessages,
        buildAssistantMessage(
          'No hay URL configurada para el backend. Define VITE_GCLOUD_ENDPOINT en el archivo .env del front.',
          'Error de configuracion',
        ),
      ])
      return
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

      setMessages((currentMessages) =>
        updateAssistantMessage(currentMessages, assistantMessageId, '', transform ?? 'Streaming'),
      )

      const sendChatRequest = (activeSession: StravaAuthSession): Promise<Response> => {
        return fetch(`${apiBaseUrl}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: requestMessage,
            llm_provider: llmProvider,
            stream: true,
            response_format: 'plan_react_v1',
            planner_mode: 'full_only',
            strava_access_token: activeSession.access_token,
            strava_athlete_id: activeSession.athlete?.id,
          }),
        })
      }

      let response = await sendChatRequest(session)

      if (!response.ok) {
        let backendError = await readBackendErrorMessage(response)
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado al contactar el backend.'
      setMessages((currentMessages) =>
        updateAssistantMessage(currentMessages, assistantMessageId, message, 'Error'),
      )
    } finally {
      setRequestStatus('idle')
      setActiveAssistantMessageId(null)
    }
  }

  return (
    <div className="chat-shell h-screen overflow-hidden bg-background text-foreground">
      <main className="flex h-full w-full p-2">
        <section className="glass-panel flex h-full w-full flex-col rounded-[28px] border border-border/80 overflow-hidden">
          <header className="flex items-center justify-between border-b border-border/70 px-5 py-3 lg:px-7">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Toontracks</h2>
              {authSession ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-500">
                  <CircleCheck className="h-3 w-3" />
                  Strava conectado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-500">
                  <ShieldAlert className="h-3 w-3" />
                  Requiere login
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {authSession ? (
                <button
                  onClick={handleLogout}
                  className="inline-flex h-8 items-center justify-center rounded-xl border border-border/60 bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Salir
                </button>
              ) : (
                <button
                  onClick={handleStartStravaLogin}
                  disabled={authPending}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-border/60 bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {authPending ? 'Conectando...' : 'Login con Strava'}
                </button>
              )}
              <button
                onClick={() => setIsDark((d) => !d)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Toggle theme"
              >
                {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
            </div>
          </header>

          {authError ? (
            <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-destructive lg:px-7">
              {authError}
            </div>
          ) : null}

          <div className="message-stream flex-1 space-y-2 overflow-y-auto px-5 py-4 lg:px-7">
            {messages.map((message) => {
              const isUser = message.role === 'user'
              const isActiveAssistantMessage =
                message.id === activeAssistantMessageId && requestStatus !== 'idle'
              const hasStructuredBlocks = Boolean(message.structured?.blocks.length)
              const hasTextContent = Boolean(message.content.trim())
              const showSpinnerOnly = isActiveAssistantMessage && !hasStructuredBlocks && !hasTextContent

              return (
                <article
                  key={message.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`message-bubble max-w-[min(80%,48rem)] rounded-2xl px-3 py-2 ${
                      isUser
                        ? 'message-bubble-user'
                        : 'message-bubble-assistant'
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
                          />
                        ) : (
                          <p className="text-xs leading-5">{message.content}</p>
                        )}

                        {isActiveAssistantMessage ? (
                          <div className="plan-react-loading-inline">
                            <BouncingDots dots={3} className="w-1.5 h-1.5 bg-foreground/80" />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          <footer className="border-t border-border/70 px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
            <RuixenPromptBox
              onSend={handleSend}
              placeholder={
                authSession
                  ? 'Preguntame por ritmo, carga, series, recuperacion o segmentos'
                  : 'Inicia sesion con Strava para habilitar el chat'
              }
              disabled={requestStatus !== 'idle' || !authSession || authPending}
              loading={requestStatus !== 'idle'}
            />
          </footer>
        </section>
      </main>
    </div>
  )
}

export default App
