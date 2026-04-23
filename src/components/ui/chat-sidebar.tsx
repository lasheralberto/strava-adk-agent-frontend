import { X, Plus, MessageSquare } from 'lucide-react'
import athlyLogo from '@/assets/athly_logo.png'
import { AnimatePresence, motion } from 'motion/react'
import type { ChatSession } from '@/types/chat-sessions'

type ChatSidebarProps = {
  sessions: ChatSession[]
  currentSessionId: string | null
  loading: boolean
  isOpen: boolean
  onNewSession: () => void
  onSelectSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onClose: () => void
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'ahora'
  if (diffMins < 60) return `hace ${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `hace ${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `hace ${diffDays}d`
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: ChatSession
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={`group relative flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-left transition-colors duration-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isActive
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      }`}
    >
      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {/* Title with right-fade mask on overflow */}
        <div
          className="relative overflow-hidden whitespace-nowrap text-[13px] font-medium leading-5"
          style={{
            maskImage: 'linear-gradient(to right, black 60%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 60%, transparent 100%)',
          }}
        >
          {session.title || 'Sin título'}
        </div>
        <p className="mt-0.5 text-[11px] opacity-50">{formatRelativeTime(session.updatedAt)}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        aria-label={`Eliminar sesión: ${session.title}`}
        className="invisible ml-auto shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:visible group-hover:opacity-100 focus-visible:visible focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  )
}

function SidebarContent({
  sessions,
  currentSessionId,
  loading,
  onNewSession,
  onSelectSession,
  onDeleteSession,
}: Omit<ChatSidebarProps, 'isOpen' | 'onClose'>) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center px-3 pb-2 pt-4">
        <img src={athlyLogo} alt="Athly" className="h-10 w-auto object-contain" />
      </div>
      <div className="px-3 pb-2 pt-2">
        <button
          onClick={onNewSession}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Nueva sesión
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loading ? (
          <p className="px-2 py-3 text-[12px] text-muted-foreground">Cargando…</p>
        ) : sessions.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-muted-foreground">Sin sesiones anteriores</p>
        ) : (
          <div className="space-y-0.5">
            {sessions.map((session) => (
              <SessionItem
                key={session.sessionId}
                session={session}
                isActive={session.sessionId === currentSessionId}
                onSelect={() => onSelectSession(session.sessionId)}
                onDelete={() => onDeleteSession(session.sessionId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ChatSidebar({
  sessions,
  currentSessionId,
  loading,
  isOpen,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onClose,
}: ChatSidebarProps) {
  const contentProps = { sessions, currentSessionId, loading, onNewSession, onSelectSession, onDeleteSession }

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-border bg-background sm:flex">
        <SidebarContent {...contentProps} />
      </aside>

      {/* Mobile: overlay drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/40 sm:hidden"
              onClick={onClose}
              aria-hidden="true"
            />
            {/* Drawer */}
            <motion.aside
              key="sidebar-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-background sm:hidden"
              aria-label="Historial de sesiones"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-3">
                <span className="text-[13px] font-semibold text-foreground">Sesiones</span>
                <button
                  onClick={onClose}
                  aria-label="Cerrar historial"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <SidebarContent {...contentProps} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
