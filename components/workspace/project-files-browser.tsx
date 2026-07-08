"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { FolderOpen, Upload, RefreshCw, Link2, Unlink } from "lucide-react"

import type { DriveFile, DriveViewMode } from "@/lib/drive/types"
import { listFiles, uploadFile, renameFile, trashFile } from "@/lib/drive/actions"
import {
  getProjectDriveConnection,
  connectProjectDrive,
  disconnectProjectDrive,
} from "@/lib/actions/project-drive"
import { getFile } from "@/lib/drive/actions"
import { DriveListItem } from "@/components/workspace/drive-file-item"
import { DriveBreadcrumbs } from "@/components/workspace/drive-breadcrumbs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ProjectFilesBrowser({
  projectId,
}: {
  projectId: string
}) {
  const [connection, setConnection] = useState<{
    folderId: string
    folderName: string | null
  } | null>(null)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([])
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectFolderId, setConnectFolderId] = useState("")
  const [connectFolderName, setConnectFolderName] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getProjectDriveConnection(projectId).then((conn) => {
      if (conn) {
        setConnection({ folderId: conn.googleDriveFolderId, folderName: conn.googleDriveFolderName })
        setCurrentFolderId(conn.googleDriveFolderId)
      }
      setLoading(false)
    })
  }, [projectId])

  const fetchFiles = useCallback(async () => {
    if (!currentFolderId) return
    setLoading(true)
    setError(null)

    try {
      const result = await listFiles(currentFolderId)
      const folders = result.files.filter((f) => f.fileType === "folder")
      const nonFolders = result.files.filter((f) => f.fileType !== "folder")
      folders.sort((a, b) => a.name.localeCompare(b.name))
      nonFolders.sort((a, b) => a.name.localeCompare(b.name))
      setFiles([...folders, ...nonFolders])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files")
    } finally {
      setLoading(false)
    }
  }, [currentFolderId])

  useEffect(() => {
    if (currentFolderId) fetchFiles()
  }, [currentFolderId, fetchFiles])

  function handleOpenFile(file: DriveFile) {
    if (file.fileType === "folder") {
      setBreadcrumbs((prev) => [
        ...prev,
        { id: currentFolderId!, name: files.find((f) => f.id === currentFolderId)?.name ?? "Folder" },
      ])
      setCurrentFolderId(file.id)
    } else if (file.webViewLink) {
      window.open(file.webViewLink, "_blank")
    }
  }

  function handleBreadcrumbNavigate(folderId: string) {
    setCurrentFolderId(folderId)
    const idx = breadcrumbs.findIndex((b) => b.id === folderId)
    setBreadcrumbs(idx >= 0 ? breadcrumbs.slice(0, idx) : [])
  }

  async function handleUpload(filesList: FileList | null) {
    if (!filesList?.length || !currentFolderId) return
    const formData = new FormData()
    formData.append("file", filesList[0])
    formData.append("parentId", currentFolderId)
    const result = await uploadFile(formData)
    if ("error" in result) setError(result.error)
    else fetchFiles()
  }

  async function handleConnect() {
    const folderId = connectFolderId.trim()
    if (!folderId) return

    try {
      const file = await getFile(folderId)
      if (file.fileType !== "folder") {
        setError("The ID must be a folder")
        return
      }
      const result = await connectProjectDrive(projectId, folderId, file.name)
      if ("error" in result) setError(result.error)
      else {
        setConnection({ folderId, folderName: file.name })
        setCurrentFolderId(folderId)
        setConnectFolderId("")
        setConnectFolderName("")
      }
    } catch {
      setError("Invalid folder ID or folder not accessible")
    }
  }

  async function handleDisconnect() {
    await disconnectProjectDrive(projectId)
    setConnection(null)
    setCurrentFolderId(null)
    setFiles([])
    setBreadcrumbs([])
  }

  if (loading && !connection) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!connection) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12">
        <Link2 className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">No Drive folder connected</p>
          <p className="text-sm text-muted-foreground">
            Connect a Google Drive folder to store and manage project files.
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
          <Input
            placeholder="Google Drive folder ID"
            value={connectFolderId}
            onChange={(e) => setConnectFolderId(e.target.value)}
          />
          <Button type="button" variant="default" size="sm" onClick={handleConnect}>
            Connect folder
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <DriveBreadcrumbs items={breadcrumbs} onNavigate={handleBreadcrumbNavigate} />
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            <Upload className="h-4 w-4" />
            Upload
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
          >
            <Unlink className="h-4 w-4" />
            Disconnect
          </Button>
        </div>
      </div>

      {connection.folderName && (
        <p className="text-xs text-muted-foreground">
          Connected to: <span className="font-medium">{connection.folderName}</span>
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button type="button" variant="ghost" size="sm" onClick={fetchFiles}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <FolderOpen className="h-12 w-12" />
          <p className="font-medium">This folder is empty</p>
          <p className="text-sm">Upload files to get started.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {files.map((file) => (
            <DriveListItem
              key={file.id}
              file={file}
              onOpen={handleOpenFile}
              onRename={() => {}}
              onDelete={() => {}}
              onStar={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  )
}
