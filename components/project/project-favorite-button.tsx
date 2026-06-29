"use client"

import { useState, useTransition } from "react"
import { Star } from "lucide-react"

import { toggleFavoriteProject } from "@/lib/actions/projects"

export function ProjectFavoriteButton({
  projectId,
  initialFavorite,
  size = "h-3.5 w-3.5",
}: {
  projectId: string
  initialFavorite: boolean
  size?: string
}) {
  const [isFavorite, setIsFavorite] = useState(initialFavorite)
  const [, startTransition] = useTransition()

  function handleToggle(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    const next = !isFavorite
    setIsFavorite(next)
    startTransition(async () => {
      const result = await toggleFavoriteProject(projectId, next)
      if ("error" in result) setIsFavorite(!next)
    })
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFavorite}
      className="text-muted-foreground hover:text-foreground"
    >
      <Star className={size} fill={isFavorite ? "currentColor" : "none"} />
    </button>
  )
}
