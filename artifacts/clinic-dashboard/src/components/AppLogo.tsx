import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface AppLogoProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizes = {
  sm: { wrap: "gap-2", icon: "w-7 h-7 rounded-lg", inner: "w-4 h-4", text: "text-base" },
  md: { wrap: "gap-2.5", icon: "w-9 h-9 rounded-xl", inner: "w-5 h-5", text: "text-lg" },
  lg: { wrap: "gap-4 flex-col", icon: "w-16 h-16 rounded-2xl", inner: "w-8 h-8", text: "text-4xl" },
}

export function AppLogo({ size = "md", className }: AppLogoProps) {
  const s = sizes[size]
  return (
    <div className={cn("flex items-center", s.wrap, className)}>
      <div className={cn("flex items-center justify-center logo-icon", s.icon)}>
        <Sparkles className={cn("text-white", s.inner)} />
      </div>
      <span className={cn("font-display font-bold tracking-tight select-none", s.text)}>
        Atend<span className="logo-ai">AI</span>
      </span>
    </div>
  )
}
