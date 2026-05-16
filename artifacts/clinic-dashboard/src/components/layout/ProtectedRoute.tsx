import { Redirect } from "wouter"
import { useAuth } from "@/contexts/auth"

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Redirect to="/login" />
  }

  return <>{children}</>
}
