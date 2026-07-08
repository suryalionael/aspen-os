export type DriveFileType = "folder" | "document" | "spreadsheet" | "presentation" | "pdf" | "image" | "video" | "audio" | "archive" | "text" | "code" | "unknown"

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  fileType: DriveFileType
  size: number | null
  modifiedTime: string
  createdTime: string
  owners: { displayName: string; email: string; photoLink?: string }[]
  lastModifyingUser: { displayName: string; email: string; photoLink?: string } | null
  iconLink: string
  thumbnailLink: string | null
  webViewLink: string
  webContentLink: string | null
  parents: string[]
  starred: boolean
  trashed: boolean
  capabilities: {
    canEdit: boolean
    canDelete: boolean
    canRename: boolean
    canMove: boolean
    canMoveChildrenIntoDrive: boolean
  }
}

export type DriveFolderTree = {
  id: string
  name: string
  children: DriveFolderTree[]
}

export type DriveSortField = "name" | "modifiedTime" | "createdTime" | "size"
export type DriveSortOrder = "asc" | "desc"

export type DriveViewMode = "grid" | "list"

export type DriveFileListResponse = {
  files: DriveFile[]
  nextPageToken: string | null
}

export type DriveSearchOptions = {
  query?: string
  pageSize?: number
  pageToken?: string
  orderBy?: string
  fields?: string
}

export const MIME_TYPE_FOLDER = "application/vnd.google-apps.folder"
export const MIME_TYPE_DOCUMENT = "application/vnd.google-apps.document"
export const MIME_TYPE_SPREADSHEET = "application/vnd.google-apps.spreadsheet"
export const MIME_TYPE_PRESENTATION = "application/vnd.google-apps.presentation"
export const MIME_TYPE_SHORTCUT = "application/vnd.google-apps.shortcut"

export function getDriveFileType(mimeType: string): DriveFileType {
  switch (mimeType) {
    case MIME_TYPE_FOLDER:
      return "folder"
    case MIME_TYPE_DOCUMENT:
      return "document"
    case MIME_TYPE_SPREADSHEET:
      return "spreadsheet"
    case MIME_TYPE_PRESENTATION:
      return "presentation"
    case "application/pdf":
      return "pdf"
    case "image/png":
    case "image/jpeg":
    case "image/gif":
    case "image/webp":
    case "image/svg+xml":
      return "image"
    case "video/mp4":
    case "video/webm":
    case "video/quicktime":
      return "video"
    case "audio/mpeg":
    case "audio/wav":
    case "audio/ogg":
      return "audio"
    case "application/zip":
    case "application/x-rar-compressed":
    case "application/gzip":
      return "archive"
    case "text/plain":
      return "text"
    default:
      if (mimeType.startsWith("text/")) return "text"
      return "unknown"
  }
}

export function mimeTypeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "text/plain": ".txt",
    "application/zip": ".zip",
    "application/json": ".json",
    "text/html": ".html",
    "text/css": ".css",
    "application/javascript": ".js",
    "text/csv": ".csv",
  }
  return map[mimeType] ?? ""
}
