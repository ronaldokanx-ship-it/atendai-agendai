import React, { createContext, useContext, useState, useCallback, useEffect } from "react"
import { jwtDecode } from "jwt-decode"

const TOKEN_KEY = "clinic_token"

type UserRole = "owner" | "supervisor" | "attendant" | "staff" | "superadmin"

interface JwtPayload {
  userId: number
  clinicId: number | null
  role: UserRole
  name: string
  exp: number
}

interface AuthUser {
  userId: number
  clinicId: number | null
  role: UserRole
  name: string
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  login: (token: string) => void
  logout: () => void
  isOwner: boolean
  isOwnerOrSupervisor: boolean
  isSuperAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function parseToken(token: string): AuthUser | null {
  try {
    const payload = jwtDecode<JwtPayload>(token)
    if (payload.exp * 1000 < Date.now()) return null
    return {
      userId: payload.userId,
      clinicId: payload.clinicId,
      role: payload.role,
      name: payload.name,
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    return stored ? parseToken(stored) : null
  })

  const login = useCallback((newToken: string) => {
    const parsed = parseToken(newToken)
    if (!parsed) return
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
    setUser(parsed)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  // Invalidate if token has expired (e.g. after tab wakes up)
  useEffect(() => {
    if (token && !parseToken(token)) {
      logout()
    }
  }, [token, logout])

  return (
    <AuthContext.Provider value={{
      user, token,
      isAuthenticated: user !== null,
      login, logout,
      isOwner: user?.role === "owner",
      isOwnerOrSupervisor: user?.role === "owner" || user?.role === "supervisor",
      isSuperAdmin: user?.role === "superadmin",
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
