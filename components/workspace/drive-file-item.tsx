"use client"

import { useState } from "react"
import {
  Folder,
  FileText,
  FileImage,
  Video,
  Music,
  Archive,
  File,
  Star,
  Trash2,
  ExternalLink,
  Pencil,
  Download,
} from "lucide-react"
import type { DriveFile } from "@/lib/drive/types"
import { Button } from "@/components/ui/button"

const typeIcons: Record<string, React.ReactNode> = {
  folder: <Folder className="h-5 w-5 text-blue-400" />,
  document: <FileText className="h-5 w-5 text-blue-500" />,
  spreadsheet: <FileText className="h-5 w-5 text-green-500" />,
  presentation: <FileText className="h-5 w-5 text-orange-500" />,
  pdf: <FileText className="h-5 w-5 text-red-500" />,
  image: <FileImage className="h-5 w-5 text-purple-500" />,
  video: <Video className="h-5 w-5 text-pink-500" />,
  audio: <Music className="h-5 w-5 text-yellow-500" />,
  archive: <Archive className="h-5 w-5 text-stone-500" />,
  text: <FileText className="h-5 w-5 text-gray-500" />,
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString()
}

export function DriveGridItem({
  file,
  onOpen,
  onRename,
  onDelete,
  onStar,
}: {
  file: DriveFile
  onOpen: (file: DriveFile) => void
  onRename: (file: DriveFile) => void
  onDelete: (file: DriveFile) => void
  onStar: (file: DriveFile) => void
}) {
  const [hovering, setHovering] = useState(false)

  return (
    <button
      type="button"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => onOpen(file)}
      className="group relative flex flex-col items-center gap-2 rounded-lg border border-transparent p-3 text-center transition-all hover:border-border hover:bg-secondary/30"
    >
      {file.thumbnailLink ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={file.thumbnailLink}
          alt=""
          className="h-20 w-20 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-md bg-secondary/50">
          {typeIcons[file.fileType] ?? <File className="h-5 w-5" />}
        </div>
      )}
      <span className="line-clamp-2 max-w-[120px] text-xs text-muted-foreground">
        {file.name}
      </span>
      {hovering && file.fileType !== "folder" && (
        <div className="absolute right-1 top-1 flex gap-0.5">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation()
              onStar(file)
            }}
          >
            <Star className={`h-3 w-3 ${file.starred ? "fill-yellow-400 text-yellow-400" : ""}`} />
          </Button>
        </div>
      )}
    </button>
  )
}

export function DriveListItem({
  file,
  onOpen,
  onRename,
  onDelete,
  onStar,
}: {
  file: DriveFile
  onOpen: (file: DriveFile) => void
  onRename: (file: DriveFile) => void
  onDelete: (file: DriveFile) => void
  onStar: (file: DriveFile) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-secondary/30">
      <button type="button" onClick={() => onOpen(file)} className="flex flex-1 items-center gap-3 min-w-0">
        <div className="flex-shrink-0">
          {typeIcons[file.fileType] ?? <File className="h-4 w-4" />}
        </div>
        <span className="truncate text-sm">{file.name}</span>
      </button>
      <span className="hidden w-20 flex-shrink-0 text-right text-xs text-muted-foreground sm:block">
        {formatFileSize(file.size)}
      </span>
      <span className="hidden w-24 flex-shrink-0 text-right text-xs text-muted-foreground md:block">
        {formatDate(file.modifiedTime)}
      </span>
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onStar(file)}
        >
          <Star className={`h-3.5 w-3.5 ${file.starred ? "fill-yellow-400 text-yellow-400" : ""}`} />
        </Button>
        {file.fileType !== "folder" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => window.open(file.webViewLink, "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
