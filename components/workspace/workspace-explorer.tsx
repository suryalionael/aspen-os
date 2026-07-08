"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { FolderOpen, RefreshCw, Upload } from "lucide-react"

import type { DriveFile, DriveViewMode, DriveSortField, DriveSortOrder } from "@/lib/drive/types"
import {
  listFiles,
  searchFiles,
  uploadFile,
} from "@/lib/drive/actions"
import { DriveBreadcrumbs } from "@/components/workspace/drive-breadcrumbs"
import { DriveToolbar } from "@/components/workspace/drive-toolbar"
import { DriveSidebar } from "@/components/workspace/drive-sidebar"
import { DriveGridItem, DriveListItem } from "@/components/workspace/drive-file-item"
import { NewFolderDialog } from "@/components/workspace/drive-new-folder-dialog"
import { RenameDialog } from "@/components/workspace/drive-rename-dialog"
import { MoveDialog } from "@/components/workspace/drive-move-dialog"
import { DeleteDialog } from "@/components/workspace/drive-delete-dialog"
import { Button } from "@/components/ui/button"
import { ToastStack } from "@/components/ui/toast-stack"
import { useToasts } from "@/lib/hooks/use-toasts"

type Breadcrumb = { id: string; name: string }

export function WorkspaceExplorer() {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([])
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<DriveViewMode>("grid")
  const [sortField, setSortField] = useState<DriveSortField>("name")
  const [sortOrder, setSortOrder] = useState<DriveSortOrder>("asc")
  const [searchQuery, setSearchQuery] = useState("")
  const [newFolderOpen, setNewFolderOpen] = useState(false)

  const [targetFile, setTargetFile] = useState<DriveFile | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toasts, pushToast } = useToasts()

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = searchQuery
        ? await searchFiles(searchQuery)
        : await listFiles(currentFolderId ?? undefined)

      const sorted = [...result.files]
      const folders = sorted.filter((f) => f.fileType === "folder")
      const nonFolders = sorted.filter((f) => f.fileType !== "folder")

      const sortFn = (a: DriveFile, b: DriveFile) => {
        const dir = sortOrder === "asc" ? 1 : -1
        if (sortField === "name") return dir * a.name.localeCompare(b.name)
        if (sortField === "modifiedTime") return dir * (new Date(a.modifiedTime).getTime() - new Date(b.modifiedTime).getTime())
        if (sortField === "size") return dir * ((a.size ?? 0) - (b.size ?? 0))
        return 0
      }

      folders.sort(sortFn)
      nonFolders.sort(sortFn)
      setFiles([...folders, ...nonFolders])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files")
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [currentFolderId, searchQuery, sortField, sortOrder])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  function handleFolderSelect(folderId: string) {
    setCurrentFolderId(folderId)
    setSearchQuery("")
  }

  function handleNavigateRoot() {
    setCurrentFolderId(null)
    setBreadcrumbs([])
    setSearchQuery("")
  }

  function handleOpenFile(file: DriveFile) {
    if (file.fileType === "folder") {
      setBreadcrumbs((prev) => {
        if (currentFolderId) {
          return [...prev, { id: currentFolderId, name: files.find((f) => f.id === currentFolderId)?.name ?? "Folder" }]
        }
        return prev
      })
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
    if (!filesList?.length) return

    const formData = new FormData()
    formData.append("file", filesList[0])
    if (currentFolderId) formData.append("parentId", currentFolderId)

    const result = await uploadFile(formData)
    if ("error" in result) {
      setError(result.error)
    } else {
      pushToast("File uploaded")
      fetchFiles()
    }
  }

  function handleSortChange(field: DriveSortField, order: DriveSortOrder) {
    setSortField(field)
    setSortOrder(order)
  }

  function handleDownload(file: DriveFile) {
    if (file.webViewLink) {
      window.open(file.webViewLink, "_blank")
    }
  }

  function handleRenameClick(file: DriveFile) {
    setTargetFile(file)
    setRenameOpen(true)
  }

  function handleMoveClick(file: DriveFile) {
    setTargetFile(file)
    setMoveOpen(true)
  }

  function handleDeleteClick(file: DriveFile) {
    setTargetFile(file)
    setDeleteOpen(true)
  }

  function handleActionComplete(action: string) {
    pushToast(action)
    fetchFiles()
  }

  return (
    <div className="flex h-full flex-1">
      <DriveSidebar
        currentFolderId={currentFolderId}
        onFolderSelect={handleFolderSelect}
        onNavigateRoot={handleNavigateRoot}
      />

      <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
        <DriveBreadcrumbs
          items={currentFolderId ? breadcrumbs : []}
          onNavigate={handleBreadcrumbNavigate}
        />

        <DriveToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onUpload={() => fileInputRef.current?.click()}
          onNewFolder={() => setNewFolderOpen(true)}
          loading={loading}
        />

        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => handleUpload(e.target.files)}
          className="hidden"
        />

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>{error}</span>
            <Button type="button" variant="ghost" size="sm" onClick={fetchFiles}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading files…</p>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <FolderOpen className="h-12 w-12" />
            <div className="text-center">
              <p className="font-medium">This folder is empty</p>
              <p className="text-sm">
                {searchQuery
                  ? "No files match your search."
                  : "Upload files or create a folder to get started."}
              </p>
            </div>
            {!searchQuery && (
              <div className="flex gap-2">
                <Button type="button" variant="default" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Upload files
                </Button>
              </div>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {files.map((file) => (
              <DriveGridItem
                key={file.id}
                file={file}
                onOpen={handleOpenFile}
                onRename={handleRenameClick}
                onDelete={handleDeleteClick}
                onMove={handleMoveClick}
                onDownload={handleDownload}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {files.map((file) => (
              <DriveListItem
                key={file.id}
                file={file}
                onOpen={handleOpenFile}
                onRename={handleRenameClick}
                onDelete={handleDeleteClick}
                onMove={handleMoveClick}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}
      </div>

      {targetFile && (
        <>
          <RenameDialog
            open={renameOpen}
            onOpenChange={setRenameOpen}
            fileId={targetFile.id}
            currentName={targetFile.name}
            onRenamed={() => handleActionComplete("File renamed")}
          />
          <MoveDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            fileId={targetFile.id}
            fileName={targetFile.name}
            currentFolderId={currentFolderId}
            onMoved={() => handleActionComplete("File moved")}
          />
          <DeleteDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            fileId={targetFile.id}
            fileName={targetFile.name}
            onDeleted={() => handleActionComplete("File moved to trash")}
          />
        </>
      )}

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        parentId={currentFolderId ?? undefined}
        onCreated={() => handleActionComplete("Folder created")}
      />

      <ToastStack toasts={toasts} />
    </div>
  )
}
