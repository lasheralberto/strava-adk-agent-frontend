import { startTransition, useEffect, useState } from 'react'
import {
  CircleCheck,
  LogIn,
  Moon,
  ShieldAlert,
  Sun,
} from 'lucide-react'
import RuixenPromptBox from '@/components/ui/ruixen-prompt-box'
import { BouncingDots } from '@/components/ui/bouncing-dots'
import './styles/chat.css'

type ChatRole = 'assistant' | 'user'

type ChatMessage = {
  id: number
  role: ChatRole
  title: string
  content: string
  tag: string
}

type RequestStatus = 'idle' | 'requesting' | 'streaming'

type ChatApiPayload = {
  response?: string
  tool_calls?: Array<Record<string, unknown>>
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
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

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

  const ensureValidStravaSession = async (): Promise<StravaAuthSession | null> => {
    if (!authSession) {
      return null
    }

    if (!isTokenExpired(authSession.expires_at)) {
      return authSession
    }

    const response = await fetch(`${apiBaseUrl}/auth/strava/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: authSession.refresh_token,
      }),
    })

    if (!response.ok) {
      writeStoredSession(null)
      setAuthSession(null)
      const errorPayload = (await response.json().catch(() => ({}))) as { error?: string; details?: string }
      throw new Error(errorPayload.error ?? errorPayload.details ?? 'Tu sesion de Strava expiro. Inicia sesion de nuevo.')
    }

    const refreshed = (await response.json()) as StravaAuthSession
    setAuthSession(refreshed)
    writeStoredSession(refreshed)
    return refreshed
  }

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
    setAuthSession(null)
    setAuthError(null)
    writeStoredSession(null)
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
      const session = await ensureValidStravaSession()
      if (!session) {
        throw new Error('No hay sesion Strava activa. Inicia sesion para continuar.')
      }

      let streamedResponse = ''

      setMessages((currentMessages) =>
        updateAssistantMessage(currentMessages, assistantMessageId, '', transform ?? 'Streaming'),
      )

      const response = await fetch(`${apiBaseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: requestMessage,
          llm_provider: llmProvider,
          stream: true,
          strava_access_token: session.access_token,
          strava_athlete_id: session.athlete?.id,
        }),
      })

      if (!response.ok) {
        let backendError = 'No se pudo obtener respuesta del backend.'
        try {
          const data = (await response.json()) as { error?: string }
          if (data.error) {
            backendError = data.error
          }
        } catch {
          // Keep default error when backend payload is not JSON.
        }
        throw new Error(backendError)
      }

      const contentType = response.headers.get('content-type') ?? ''
      const isEventStream = contentType.includes('text/event-stream')

      if (!isEventStream) {
        const payload = (await response.json()) as ChatApiPayload
        const finalText = (payload.response ?? '').trim() || 'El backend respondio sin contenido.'
        setMessages((currentMessages) =>
          updateAssistantMessage(currentMessages, assistantMessageId, finalText, transform ?? 'Respuesta'),
        )
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

            if (payload.response) {
              streamedResponse += payload.response
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
                    {message.id === activeAssistantMessageId && requestStatus !== 'idle' ? (
                      <BouncingDots dots={3} className="w-2 h-2 bg-foreground" />
                    ) : (
                      <p className="text-xs leading-5">{message.content}</p>
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
