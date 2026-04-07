import { startTransition, useEffect, useState } from 'react'
import {
 
  Moon,
  Sun,
 
} from 'lucide-react'
import RuixenPromptBox from '@/components/ui/ruixen-prompt-box'
import './styles/chat.css'

type ChatRole = 'assistant' | 'user'

type ChatMessage = {
  id: number
  role: ChatRole
  title: string
  content: string
  tag: string
}

const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')
const llmProvider = (import.meta.env.VITE_LLM_PROVIDER ?? '').trim()

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: 'assistant',
    title: 'Strava Agent',
    content:
      'Tengo sincronizadas tus ultimas actividades. Puedo resumir carga, revisar segmentos y traducir metricas en recomendaciones claras.',
    tag: 'Lectura inicial',
  },
  {
    id: 2,
    role: 'assistant',
    title: 'Sugerencia',
    content:
      'Hoy veo dos senales: volumen estable y pulso algo alto en ritmos medios. Si quieres, arranco con un resumen semanal o con una propuesta de sesion.',
    tag: 'Insight',
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
    title: 'Strava Agent',
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
      title: 'Strava Agent',
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

function App() {
  const [messages, setMessages] = useState(initialMessages)
  const [isSending, setIsSending] = useState(false)
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

  const handleSend = async ({ message, transform }: { message: string; transform: string | null }) => {
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

    setIsSending(true)

    try {
      const assistantMessageId = Date.now() + 1
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
        }),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error || 'No se pudo obtener respuesta del backend.')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('El navegador no pudo abrir el stream de respuesta.')
      }

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
            const payload = JSON.parse(parsedEvent.data) as { response?: string }

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
      setMessages((currentMessages) => [
        ...currentMessages,
        buildAssistantMessage(message, 'Error'),
      ])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="chat-shell h-screen overflow-hidden bg-background text-foreground">
      <main className="flex h-full w-full p-2">
        <section className="glass-panel flex h-full w-full flex-col rounded-[28px] border border-border/80 overflow-hidden">
          <header className="flex items-center justify-between border-b border-border/70 px-5 py-3 lg:px-7">
            <div className="flex items-center gap-3">
              
              <h2 className="text-sm font-semibold tracking-tight text-foreground">ChatSTRVAI</h2>
            </div>
            <div className="flex items-center gap-2">
              
              <button
                onClick={() => setIsDark((d) => !d)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Toggle theme"
              >
                {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
            </div>
          </header>

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
                        ? 'border border-orange-400/70 bg-primary text-primary-foreground shadow-[0_2px_12px_rgba(249,115,22,0.35)]'
                        : 'border border-orange-300/40 bg-background/80 text-foreground shadow-[0_2px_10px_rgba(249,115,22,0.12)]'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-current/50">
                      <span>{message.title}</span>
                      <span className="rounded-full bg-black/8 px-1.5 py-0.5 text-current/60">
                        {message.tag}
                      </span>
                    </div>
                    <p className="text-xs leading-5">{message.content}</p>
                  </div>
                </article>
              )
            })}
          </div>

          <footer className="border-t border-border/70 px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
            <RuixenPromptBox
              onSend={handleSend}
              placeholder="Preguntame por carga, ritmo, intervalos, recuperacion o segmentos"
              disabled={isSending}
            />
          </footer>
        </section>
      </main>
    </div>
  )
}

export default App
