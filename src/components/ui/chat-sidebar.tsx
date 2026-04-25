import { X, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ChatSession } from '@/types/chat-sessions'
import { useLocale } from '@/hooks/use-locale'

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

interface SidebarTexts {
  newSession: string
  loading: string
  noSessions: string
  deleteSession: (title: string) => string
  untitled: string
  now: string
  minutesAgo: (n: number) => string
  hoursAgo: (n: number) => string
  daysAgo: (n: number) => string
}

function formatRelativeTime(isoString: string, s: SidebarTexts): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return s.now
  if (diffMins < 60) return s.minutesAgo(diffMins)
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return s.hoursAgo(diffHours)
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return s.daysAgo(diffDays)
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function ChatGlyph({ active }: { active: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <rect x="2" y="3" width="10" height="7.5" rx="1.5"
        stroke={active ? 'hsl(18 98% 50%)' : 'currentColor'}
        strokeWidth="1.2" />
      <path d="M5 11 L5 12.5 L7 11"
        stroke={active ? 'hsl(18 98% 50%)' : 'currentColor'}
        strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AthlyMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
      <path d="M11 3 L19 19 L14.5 19 L11 11.5 L7.5 19 L3 19 Z" fill="#fff" />
      <path d="M11 11.5 L13.2 16 L8.8 16 Z" fill="hsl(18 98% 50%)" />
    </svg>
  )
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  sidebarTexts,
}: {
  session: ChatSession
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  sidebarTexts: SidebarTexts
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={`group relative flex cursor-pointer items-center gap-2 rounded-[10px] px-3 py-2.5 text-left transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isActive
          ? 'border border-white/10 bg-popover text-foreground'
          : 'border border-transparent text-muted-foreground hover:bg-white/[0.03] hover:text-foreground'
      }`}
    >
      {/* Orange active bar */}
      <div
        className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-primary transition-opacity duration-100"
        style={{ opacity: isActive ? 1 : 0 }}
        aria-hidden="true"
      />

      <ChatGlyph active={isActive} />

      <div className="min-w-0 flex-1 pl-1.5">
        <div
          className="relative overflow-hidden whitespace-nowrap text-[13px] font-medium leading-5"
          style={{
            maskImage: 'linear-gradient(to right, black 70%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 70%, transparent 100%)',
          }}
        >
          {session.title || sidebarTexts.untitled}
        </div>
        <p
          className="mt-0.5 text-[11px] tracking-[0.04em]"
          style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}
        >
          {formatRelativeTime(session.updatedAt, sidebarTexts)}
        </p>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        aria-label={sidebarTexts.deleteSession(session.title)}
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
  const { t } = useLocale()
  return (
    <div className="flex h-full flex-col">
      {/* Brand header */}
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-5 py-5">
        <AthlyMark />
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Athly</span>
      </div>

      {/* New session button */}
      <div className="px-3.5 pb-2.5 pt-3.5">
        <button
          onClick={onNewSession}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors duration-100 hover:border-primary/35 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t.sidebar.newSession}
        </button>
      </div>

      {/* Section label */}
      <div
        className="px-5 pb-1.5 pt-2 text-[10px] tracking-[0.14em] text-muted-foreground/60"
        style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}
      >
        RECIENTES
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
        {loading ? (
          <p className="px-3 py-3 text-[12px] text-muted-foreground">{t.sidebar.loading}</p>
        ) : sessions.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-muted-foreground">{t.sidebar.noSessions}</p>
        ) : (
          <div className="space-y-0.5">
            {sessions.map((session) => (
              <SessionItem
                key={session.sessionId}
                session={session}
                isActive={session.sessionId === currentSessionId}
                onSelect={() => onSelectSession(session.sessionId)}
                onDelete={() => onDeleteSession(session.sessionId)}
                sidebarTexts={t.sidebar}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer — Strava sync status */}
      <div
        className="flex items-center gap-2 border-t border-white/[0.06] px-5 py-3 text-[10px] tracking-[0.08em] text-muted-foreground/50"
        style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}
      >
        <div
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(142_71%_45%)]"
          style={{ boxShadow: '0 0 6px hsl(142 71% 45%)' }}
          aria-hidden="true"
        />
        STRAVA · ATHLY
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
      <aside className="hidden h-full w-[260px] shrink-0 flex-col border-r border-white/[0.06] bg-card sm:flex">
        <SidebarContent {...contentProps} />
      </aside>

      {/* Mobile: overlay drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/50 sm:hidden"
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.aside
              key="sidebar-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-[260px] border-r border-white/[0.06] bg-card sm:hidden"
              aria-label="Historial de sesiones"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
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
