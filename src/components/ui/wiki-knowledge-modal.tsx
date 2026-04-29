import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Brain, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WikiFile {
  name: string
  path: string
}

interface WikiKnowledgeModalProps {
  athleteId: number | null
  apiBaseUrl: string
}

export function WikiKnowledgeModal({ athleteId, apiBaseUrl }: WikiKnowledgeModalProps) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<WikiFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<{ name: string; content: string } | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

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
    if (open) fetchFiles()
    else {
      setSelectedFile(null)
      setFiles([])
      setFilesError(null)
    }
  }, [open, fetchFiles])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const displayName = (name: string) =>
    name.replace(/\.md$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Knowledge base"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.03] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Brain className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === overlayRef.current) setOpen(false) }}
        >
          <div className="flex w-[540px] max-h-[80vh] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-card shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
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
                <Brain className="h-4 w-4 text-primary shrink-0" />
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
            <div className="flex-1 overflow-y-auto">
              {selectedFile ? (
                <div className="px-6 py-5">
                  {loadingContent ? (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      Loading…
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:rounded-lg [&_pre]:bg-white/[0.06] [&_pre]:p-4 [&_blockquote]:border-l-primary/60 [&_a]:text-primary">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedFile.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-2">
                  {loadingFiles && (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      Loading files…
                    </div>
                  )}
                  {filesError && !loadingFiles && (
                    <div className="px-6 py-4 text-sm text-destructive">{filesError}</div>
                  )}
                  {!loadingFiles && !filesError && files.length === 0 && (
                    <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                      No knowledge files found. Run a sync first.
                    </div>
                  )}
                  {!loadingFiles && files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => fetchFileContent(file)}
                      className={cn(
                        'flex w-full items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-white/[0.04]',
                        'border-b border-white/[0.04] last:border-0'
                      )}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-[13px] font-medium text-foreground">
                        {displayName(file.name)}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground/60">
                        {file.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {!selectedFile && !loadingFiles && files.length > 0 && (
              <div className="shrink-0 border-t border-white/[0.06] px-6 py-3">
                <span className="text-[12px] text-muted-foreground">
                  {files.length} file{files.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
