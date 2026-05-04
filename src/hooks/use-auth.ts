import { useCallback, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'

const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')

export type AuthUser = {
  uid: string
  email: string
  displayName: string
  photoURL: string
  firstname: string
  lastname: string
}

type AuthState = {
  user: AuthUser | null
  loading: boolean
  error: string | null
}

async function verifyWithBackend(firebaseUser: User): Promise<AuthUser> {
  const idToken = await firebaseUser.getIdToken()
  const response = await fetch(`${apiBaseUrl}/auth/firebase/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Auth error ${response.status}`)
  }
  return response.json() as Promise<AuthUser>
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null })

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setState({ user: null, loading: false, error: null })
        return
      }
      try {
        const user = await verifyWithBackend(firebaseUser)
        setState({ user, loading: false, error: null })
      } catch {
        setState({ user: null, loading: false, error: null })
      }
    })
    return unsubscribe
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      const user = await verifyWithBackend(result.user)
      setState({ user, loading: false, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión con Google.'
      setState({ user: null, loading: false, error: message })
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string, _name: string, password: string, isRegister: boolean) => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const credential = isRegister
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password)
      const user = await verifyWithBackend(credential.user)
      setState({ user, loading: false, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión.'
      setState({ user: null, loading: false, error: message })
    }
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth)
    setState({ user: null, loading: false, error: null })
  }, [])

  return { ...state, signInWithGoogle, signInWithEmail, signOut }
}
