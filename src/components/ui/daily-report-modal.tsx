import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AnimatePresence, motion } from 'motion/react'
import { BarChart2, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DailyReportModalProps {
  athleteId: number | null
  apiBaseUrl: string
  internalToken: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type Status = 'idle' | 'loading' | 'content' | 'generating' | 'error'

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export function DailyReportModal({ athleteId, apiBaseUrl, internalToken, open: openProp, onOpenChange }: DailyReportModalProps) {
  const isControlled = openProp !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isControlled ? openProp! : internalOpen
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v)
    else setInternalOpen(v)
  }
  const [status, setStatus] = useState<Status>('idle')
  const [content, setContent] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const isMobile = useIsMobile()
  const sheetRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (pollTimeoutRef.current !== null) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    if (!athleteId) return

    clearPolling()

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/daily-report/${athleteId}`)
        if (res.ok) {
          const data = await res.json()
          clearPolling()
          setContent(data.content ?? data.report ?? null)
          setGeneratedAt(data.generated_at ?? data.created_at ?? null)
          setStatus('content')
        } else if (res.status !== 404) {
          clearPolling()
          setErrorMsg(`Error fetching report: ${res.status}`)
          setStatus('error')
        }
        // 404 means still generating — keep polling
      } catch {
        clearPolling()
        setErrorMsg('Network error while polling for report.')
        setStatus('error')
      }
    }, POLL_INTERVAL_MS)

    // Hard timeout after 3 minutes
    pollTimeoutRef.current = setTimeout(() => {
      clearPolling()
      setErrorMsg('La generación del informe está tardando más de lo esperado. Puedes esperar unos minutos y volver a intentarlo.')
      setStatus('error')
    }, POLL_TIMEOUT_MS)
  }, [athleteId, apiBaseUrl, clearPolling])

  const triggerGenerate = useCallback(async (force: boolean) => {
    if (!athleteId) return
    try {
      await fetch(`${apiBaseUrl}/internal/daily-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': internalToken,
        },
        body: JSON.stringify({ athlete_id: athleteId, force }),
      })
      // Whether 200 or 202, start polling
      setStatus('generating')
      startPolling()
    } catch {
      setErrorMsg('Failed to trigger report generation.')
      setStatus('error')
    }
  }, [athleteId, apiBaseUrl, internalToken, startPolling])

  const loadReport = useCallback(async () => {
    if (!athleteId) return
    setStatus('loading')
    setErrorMsg(null)
    try {
      const res = await fetch(`${apiBaseUrl}/daily-report/${athleteId}`)
      if (res.ok) {
        const data = await res.json()
        setContent(data.content ?? data.report ?? null)
        setGeneratedAt(data.generated_at ?? data.created_at ?? null)
        setStatus('content')
      } else if (res.status === 404) {
        // No report yet — generate one
        await triggerGenerate(false)
      } else {
        setErrorMsg(`Error loading report: ${res.status}`)
        setStatus('error')
      }
    } catch {
      setErrorMsg('Network error while loading report.')
      setStatus('error')
    }
  }, [athleteId, apiBaseUrl, triggerGenerate])

  // Load on open, reset on close
  useEffect(() => {
    if (open) {
      loadReport()
      document.body.style.overflow = 'hidden'
    } else {
      clearPolling()
      setStatus('idle')
      setContent(null)
      setGeneratedAt(null)
      setErrorMsg(null)
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Cleanup polling on unmount
  useEffect(() => () => { clearPolling() }, [clearPolling])

  const formatGeneratedAt = (iso: string | null) => {
    if (!iso) return null
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso))
    } catch {
      return null
    }
  }

  const handleRegenerate = async () => {
    clearPolling()
    setContent(null)
    setGeneratedAt(null)
    setErrorMsg(null)
    setStatus('generating')
    await triggerGenerate(true)
  }

  const handleRetry = () => {
    clearPolling()
    setErrorMsg(null)
    loadReport()
  }

  const panelContent = (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="text-[15px] font-semibold text-foreground">Informe Diario</h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Cargando informe...
          </div>
        )}

        {status === 'generating' && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
            <svg className="h-5 w-5 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Generando tu informe diario...</span>
            <span className="text-[12px] text-muted-foreground/60">Esto puede tardar 1-2 minutos</span>
          </div>
        )}

        {status === 'content' && content && (
          <div className="px-5 py-5">
            <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_code]:rounded [&_code]:bg-white/[0.08] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:rounded-lg [&_pre]:bg-white/[0.06] [&_pre]:p-4 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_strong]:text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center gap-4 px-5 py-12">
            <p className="text-center text-sm text-destructive">{errorMsg ?? 'An error occurred.'}</p>
            <button
              type="button"
              onClick={handleRetry}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium',
                'text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground'
              )}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      {status === 'content' && (
        <div className="flex shrink-0 items-center justify-between border-t border-white/[0.06] px-5 py-3">
          <span className="text-[12px] text-muted-foreground">
            {formatGeneratedAt(generatedAt) ? `Generado el ${formatGeneratedAt(generatedAt)}` : ''}
          </span>
          <button
            type="button"
            onClick={handleRegenerate}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium',
              'text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground'
            )}
          >
            <RefreshCw className="h-3 w-3" />
            Regenerar
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Informe diario"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BarChart2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              {/* Backdrop */}
              <motion.div
                key="daily-report-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm"
                onClick={() => setOpen(false)}
              />

              {isMobile ? (
                /* Mobile: bottom sheet */
                <motion.div
                  key="daily-report-sheet"
                  ref={sheetRef}
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.8 }}
                  className="fixed bottom-0 left-0 right-0 z-[99999] flex max-h-[88svh] flex-col overflow-hidden rounded-t-2xl border-t border-white/[0.08] bg-card shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* drag handle */}
                  <div className="flex shrink-0 justify-center pt-3 pb-1">
                    <div className="h-1 w-10 rounded-full bg-white/20" />
                  </div>
                  {panelContent}
                </motion.div>
              ) : (
                /* Desktop: centered dialog */
                <motion.div
                  key="daily-report-dialog"
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.7 }}
                  className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none"
                >
                  <div
                    className="pointer-events-auto flex w-[540px] max-h-[80vh] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-card shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {panelContent}
                  </div>
                </motion.div>
              )}
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
