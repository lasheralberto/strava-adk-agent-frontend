import { useCallback, useEffect, useState } from 'react'

const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')
const SESSION_KEY = 'athly_auth_user'

export type AuthUser = {
  uid: string
  email: string
  displayName: string
  photoURL: string
  firstname: string
  lastname: string
}

function loadStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

function storeUser(user: AuthUser | null) {
  if (user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
  } else {
    sessionStorage.removeItem(SESSION_KEY)
  }
}

function decodeBase64Url(str: string): string {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4)
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
}

async function postToBackend(path: string, body: Record<string, unknown>): Promise<AuthUser> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(data.error ?? data.message ?? `Error ${response.status}`)
  }
  return response.json() as Promise<AuthUser>
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(loadStoredUser)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    storeUser(user)
  }, [user])

  // Handle Google OAuth callback params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const googleAuth = params.get('google_auth')
    const googleAuthError = params.get('google_auth_error')

    if (googleAuth) {
      try {
        const userData = JSON.parse(decodeBase64Url(googleAuth)) as AuthUser
        setUser(userData)
      } catch {
        setError('Error procesando la respuesta de Google.')
      }
      const clean = new URL(window.location.href)
      clean.searchParams.delete('google_auth')
      window.history.replaceState({}, '', clean.toString())
    } else if (googleAuthError) {
      setError(`Error al iniciar sesión con Google: ${googleAuthError}`)
      const clean = new URL(window.location.href)
      clean.searchParams.delete('google_auth_error')
      window.history.replaceState({}, '', clean.toString())
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const redirectUri = window.location.origin + '/'
      const response = await fetch(
        `${apiBaseUrl}/auth/google/start?redirect_uri=${encodeURIComponent(redirectUri)}`,
      )
      if (!response.ok) throw new Error('No se pudo iniciar el login con Google.')
      const { auth_url } = (await response.json()) as { auth_url: string }
      window.location.href = auth_url
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión con Google.'
      setError(message)
      setLoading(false)
    }
  }, [])

  const signInWithEmail = useCallback(
    async (email: string, name: string, password: string, isRegister: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const authUser = await postToBackend('/auth/email', {
          email,
          name,
          password,
          is_register: isRegister,
        })
        setUser(authUser)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al iniciar sesión.'
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const signOut = useCallback(() => {
    storeUser(null)
    setUser(null)
    setError(null)
  }, [])

  return { user, loading, error, signInWithGoogle, signInWithEmail, signOut }
}
