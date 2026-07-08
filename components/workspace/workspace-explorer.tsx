"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { FolderOpen, File, RefreshCw, Upload } from "lucide-react"

import type { DriveFile, DriveViewMode, DriveSortField, DriveSortOrder } from "@/lib/drive/types"
import {
  listFiles,
  searchFiles,
  listRecentFiles,
  listTrashedFiles,
  listSharedWithMe,
  trashFile,
  restoreFile,
  renameFile,
  uploadFile,
  starFile,
} from "@/lib/drive/actions"
import { DriveBreadcrumbs } from "@/components/workspace/drive-breadcrumbs"
import { DriveToolbar } from "@/components/workspace/drive-toolbar"
import { DriveSidebar } from "@/components/workspace/drive-sidebar"
import { DriveGridItem, DriveListItem } from "@/components/workspace/drive-file-item"
import { NewFolderDialog } from "@/components/workspace/drive-new-folder-dialog"
import { Button } from "@/components/ui/button"

type ViewType = "root" | "recent" | "starred" | "shared" | "trash"

type Breadcrumb = { id: string; name: string }

export function WorkspaceExplorer() {
  const [currentView, setCurrentView] = useState<ViewType>("root")
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
  const [renamingFile, setRenamingFile] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let result: { files: DriveFile[]; nextPageToken: string | null }

      if (searchQuery) {
        result = await searchFiles(searchQuery)
      } else {
        switch (currentView) {
          case "recent":
            result = await listRecentFiles()
            break
          case "shared":
            result = await listSharedWithMe()
            break
          case "trash":
            result = await listTrashedFiles()
            break
          default:
            result = await listFiles(currentFolderId ?? "root")
        }
      }

      let sorted = [...result.files]
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
  }, [currentView, currentFolderId, searchQuery, sortField, sortOrder])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  function handleFolderSelect(folderId: string) {
    setCurrentView("root")
    setCurrentFolderId(folderId)
    setSearchQuery("")
  }

  function handleViewChange(view: ViewType) {
    setCurrentView(view)
    setSearchQuery("")
    if (view !== "root") {
      setCurrentFolderId(null)
      setBreadcrumbs([])
    } else {
      setCurrentFolderId("root")
      setBreadcrumbs([])
    }
  }

  function handleOpenFile(file: DriveFile) {
    if (file.fileType === "folder") {
      setBreadcrumbs((prev) => {
        if (currentFolderId && currentFolderId !== "root") {
          return [...prev, { id: currentFolderId, name: files.find((f) => f.id === currentFolderId)?.name ?? "Folder" }]
        }
        return prev
      })
      setCurrentFolderId(file.id)
    } else {
      if (file.webViewLink) {
        window.open(file.webViewLink, "_blank")
      }
    }
  }

  function handleBreadcrumbNavigate(folderId: string) {
    setCurrentFolderId(folderId)
    const idx = breadcrumbs.findIndex((b) => b.id === folderId)
    if (idx >= 0) {
      setBreadcrumbs(breadcrumbs.slice(0, idx))
    } else {
      setBreadcrumbs([])
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return

    const formData = new FormData()
    formData.append("file", files[0])
    if (currentFolderId) formData.append("parentId", currentFolderId)

    const result = await uploadFile(formData)
    if ("error" in result) {
      setError(result.error)
    } else {
      fetchFiles()
    }
  }

  async function handleTrash(file: DriveFile) {
    await trashFile(file.id)
    fetchFiles()
  }

  async function handleRestore(file: DriveFile) {
    await restoreFile(file.id)
    fetchFiles()
  }

  async function handleStar(file: DriveFile) {
    await starFile(file.id, !file.starred)
    fetchFiles()
  }

  async function handleRename(file: DriveFile, newName: string) {
    if (newName && newName !== file.name) {
      await renameFile(file.id, newName)
      fetchFiles()
    }
    setRenamingFile(null)
  }

  function handleSortChange(field: DriveSortField, order: DriveSortOrder) {
    setSortField(field)
    setSortOrder(order)
  }

  return (
    <div className="flex h-full flex-1">
      <DriveSidebar
        currentFolderId={currentFolderId}
        onFolderSelect={handleFolderSelect}
        onViewChange={handleViewChange}
        currentView={currentView}
      />

      <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
        <DriveBreadcrumbs
          items={currentFolderId && currentFolderId !== "root" ? breadcrumbs : []}
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
                {currentView === "trash"
                  ? "No files in trash."
                  : currentView === "recent"
                    ? "No recently modified files."
                    : currentView === "shared"
                      ? "No files shared with you."
                      : searchQuery
                        ? "No files match your search."
                        : "Upload files or create a folder to get started."}
            </p>
            </div>
            {!searchQuery && currentView === "root" && (
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
                onRename={() => {}}
                onDelete={currentView === "trash" ? handleRestore : handleTrash}
                onStar={handleStar}
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
                onRename={() => {}}
                onDelete={currentView === "trash" ? handleRestore : handleTrash}
                onStar={handleStar}
              />
            ))}
          </div>
        )}
      </div>

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        parentId={currentFolderId ?? "root"}
        onCreated={fetchFiles}
      />
    </div>
  )
}
