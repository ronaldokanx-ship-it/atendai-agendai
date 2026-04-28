import { Redirect } from "wouter"
import { useAuth } from "@/contexts/auth"

export function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth()

  if (!isAuthenticated) return <Redirect to="/login" />
  if (user?.role !== "superadmin") return <Redirect to="/dashboard" />

  return <>{children}</>
}
