import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Brain, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WikiFile {
  name: string
  path: string
  updated_at: string | null
}

interface WikiKnowledgeModalProps {
  athleteId: number | null
  apiBaseUrl: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

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

export function WikiKnowledgeModal({ athleteId, apiBaseUrl, open: openProp, onOpenChange }: WikiKnowledgeModalProps) {
  const isControlled = openProp !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isControlled ? openProp! : internalOpen
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v)
    else setInternalOpen(v)
  }
  const [files, setFiles] = useState<WikiFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<{ name: string; content: string } | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const isMobile = useIsMobile()
  const sheetRef = useRef<HTMLDivElement>(null)

  const fetchFiles = useCallback(async () => {
    if (!athleteId) return
    setLoadingFiles(true)
    setFilesError(null)
    try {
      const res = await fetch(`${apiBaseUrl}/wiki/files/${athleteId}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const data: WikiFile[] = await res.json()
      setFiles(data)
    } catch {
      setFilesError('Failed to load files.')
    } finally {
      setLoadingFiles(false)
    }
  }, [athleteId, apiBaseUrl])

  const fetchFileContent = useCallback(async (file: WikiFile) => {
    if (!athleteId) return
    setLoadingContent(true)
    try {
      const res = await fetch(`${apiBaseUrl}/wiki/files/${athleteId}/${file.name}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const data: { name: string; content: string } = await res.json()
      setSelectedFile({ name: file.name, content: data.content })
    } catch {
      setSelectedFile({ name: file.name, content: '_Error loading file content._' })
    } finally {
      setLoadingContent(false)
    }
  }, [athleteId, apiBaseUrl])

  useEffect(() => {
    if (open) {
      fetchFiles()
      document.body.style.overflow = 'hidden'
    } else {
      setSelectedFile(null)
      setFiles([])
      setFilesError(null)
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open, fetchFiles])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const displayName = (name: string) =>
    name.replace(/\.md$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  const formatUpdated = (iso: string | null) => {
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

  const panelContent = (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-2">
          {selectedFile && (
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              aria-label="Back to list"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <Brain className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="text-[15px] font-semibold text-foreground">
            {selectedFile ? displayName(selectedFile.name) : 'Knowledge Base'}
          </h2>
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
        {selectedFile ? (
          <div className="px-5 py-5">
            {loadingContent ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading…
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_code]:rounded [&_code]:bg-white/[0.08] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:rounded-lg [&_pre]:bg-white/[0.06] [&_pre]:p-4 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_strong]:text-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedFile.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ) : (
          <div className="py-1">
            {loadingFiles && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading files…
              </div>
            )}
            {filesError && !loadingFiles && (
              <div className="px-5 py-4 text-sm text-destructive">{filesError}</div>
            )}
            {!loadingFiles && !filesError && files.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                No knowledge files found. Run a sync first.
              </div>
            )}
            {!loadingFiles && files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => fetchFileContent(file)}
                className={cn(
                  'flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.04]',
                  'border-b border-white/[0.04] last:border-0'
                )}
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {displayName(file.name)}
                  </span>
                  {formatUpdated(file.updated_at) && (
                    <span className="text-[11px] text-muted-foreground/60">
                      Updated {formatUpdated(file.updated_at)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {!selectedFile && !loadingFiles && files.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.06] px-5 py-3">
          <span className="text-[12px] text-muted-foreground">
            {files.length} file{files.length !== 1 ? 's' : ''}
          </span>
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
          aria-label="Knowledge base"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Brain className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              {/* Backdrop */}
              <motion.div
                key="wiki-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm"
                onClick={() => setOpen(false)}
              />

              {isMobile ? (
                /* ── Mobile: bottom sheet ── */
                <motion.div
                  key="wiki-sheet"
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
                /* ── Desktop: centered dialog ── */
                <motion.div
                  key="wiki-dialog"
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
