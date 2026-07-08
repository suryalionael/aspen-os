"use client"

import { useState, useRef } from "react"
import { Upload, File, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react"

import { getUploadUrl } from "@/lib/drive/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type UploadState = "idle" | "initiating" | "uploading" | "complete" | "error"

export function UploadDialog({
  open,
  onOpenChange,
  currentFolderId,
  onUploaded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentFolderId: string | null
  onUploaded: () => void
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadState("idle")
      setError(null)
      setProgress(0)
    }
  }

  async function handleUpload() {
    if (!selectedFile) return

    setUploadState("initiating")
    setError(null)
    setProgress(0)

    try {
      const result = await getUploadUrl(
        selectedFile.name,
        selectedFile.type || "application/octet-stream",
        selectedFile.size,
        currentFolderId ?? undefined
      )

      if ("error" in result) {
        setUploadState("error")
        setError(result.error)
        return
      }

      setUploadState("uploading")
      setProgress(0)

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100)
            setProgress(pct)
          }
        })

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setProgress(100)
            resolve()
          } else {
            let msg = `Upload failed (${xhr.status})`
            try {
              const resp = JSON.parse(xhr.responseText)
              if (resp.error?.message) msg = resp.error.message
            } catch {}
            reject(new Error(msg))
          }
        })

        xhr.addEventListener("error", () => reject(new Error("Network error during upload")))
        xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")))

        xhr.open("PUT", result.uploadUrl)
        xhr.setRequestHeader("Content-Type", selectedFile.type || "application/octet-stream")
        xhr.send(selectedFile)
      })

      setUploadState("complete")
      setTimeout(() => {
        onOpenChange(false)
        onUploaded()
      }, 1200)
    } catch (err) {
      setUploadState("error")
      setError(err instanceof Error ? err.message : "Upload failed")
    }
  }

  function reset() {
    xhrRef.current?.abort()
    setSelectedFile(null)
    setUploadState("idle")
    setProgress(0)
    setError(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Upload file</DialogTitle>
          <DialogDescription>Choose a file to upload to the workspace.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!selectedFile ? (
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-muted-foreground/30">
              <Upload className="h-8 w-8 text-muted-foreground/60" />
              <div className="text-center">
                <p className="text-sm font-medium">Click to select a file</p>
                <p className="text-xs text-muted-foreground">or drag and drop</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/50">
                  <File className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(selectedFile.size)}</p>
                </div>
                {uploadState === "idle" && (
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-md p-1 text-muted-foreground hover:bg-secondary/50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {uploadState === "complete" && (
                  <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />
                )}
                {uploadState === "error" && (
                  <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                )}
              </div>

              {(uploadState === "initiating" || uploadState === "uploading") && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {uploadState === "initiating" ? "Preparing upload…" : `Uploading ${formatSize(selectedFile.size)}`}
                    </span>
                    <span className="font-medium">
                      {uploadState === "initiating" ? "—" : `${progress}%`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200"
                      style={{ width: `${uploadState === "initiating" ? 5 : progress}%` }}
                    />
                  </div>
                  {uploadState === "uploading" && selectedFile.size > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      {(selectedFile.size * progress / 100 / (1024 * 1024)).toFixed(1)} MB / {formatSize(selectedFile.size)}
                    </p>
                  )}
                </div>
              )}

              {uploadState === "complete" && (
                <p className="text-xs text-green-600 dark:text-green-400">Upload complete</p>
              )}

              {uploadState === "error" && error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {uploadState === "idle" && selectedFile && (
              <>
                <Button type="button" variant="outline" size="sm" className="flex-1" onClick={reset}>
                  Cancel
                </Button>
                <Button type="button" size="sm" className="flex-1" onClick={handleUpload}>
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
              </>
            )}
            {uploadState === "error" && (
              <Button type="button" size="sm" className="flex-1" onClick={handleUpload}>
                <Loader2 className="h-4 w-4" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
