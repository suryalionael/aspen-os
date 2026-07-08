"use server"

import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/google/client"
import { tryGetDriveRootFolderId } from "@/lib/drive/config"
import type {
  DriveFile,
  DriveFileListResponse,
  DriveFolderTree,
  DriveSearchOptions,
} from "@/lib/drive/types"
import {
  MIME_TYPE_FOLDER,
  MIME_TYPE_DOCUMENT,
  MIME_TYPE_SPREADSHEET,
  MIME_TYPE_PRESENTATION,
  getDriveFileType,
} from "@/lib/drive/types"

const DRIVE_API = "https://www.googleapis.com/drive/v3"
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
const FIELDS =
  "id,name,mimeType,size,modifiedTime,createdTime,owners,lastModifyingUser,iconLink,thumbnailLink,webViewLink,webContentLink,parents,starred,trashed,capabilities"

async function getUserId(): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getSession()
  if (!data.session?.user) throw new Error("Not authenticated")
  return data.session.user.id
}

async function getAuthToken(): Promise<string> {
  const userId = await getUserId()
  const token = await getValidAccessToken(userId)
  if (!token) throw new Error("Google account not connected")
  return token
}

async function driveFetch<T>(
  path: string,
  options?: RequestInit & { userId?: string }
): Promise<T> {
  const token = options?.userId
    ? (await getValidAccessToken(options.userId)) ?? ""
    : await getAuthToken()

  if (!token) throw new Error("Google account not connected")

  const response = await fetch(`${DRIVE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    },
  })

  if (!response.ok) {
    const errorBody = await response.text()
    let parsed: { error?: { message?: string; status?: string } } = {}
    try { parsed = JSON.parse(errorBody) } catch {}

    if (parsed.error?.status === "PERMISSION_DENIED" && parsed.error?.message?.includes("Drive API has not been used")) {
      const projectMatch = parsed.error.message.match(/project\s+(\d+)/)
      const projectId = projectMatch ? projectMatch[1] : "your-project"
      throw new Error(
        `Google Drive API is not enabled. Go to https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=${projectId} and enable the Google Drive API, then try again.`
      )
    }

    throw new Error(`Drive API error: ${parsed.error?.message ?? errorBody}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

function parseFile(item: Record<string, unknown>): DriveFile {
  return {
    id: item.id as string,
    name: item.name as string,
    mimeType: item.mimeType as string,
    fileType: getDriveFileType(item.mimeType as string),
    size: (item.size as number) ?? null,
    modifiedTime: item.modifiedTime as string,
    createdTime: item.createdTime as string,
    owners: (item.owners as DriveFile["owners"]) ?? [],
    lastModifyingUser: (item.lastModifyingUser as DriveFile["lastModifyingUser"]) ?? null,
    iconLink: (item.iconLink as string) ?? "",
    thumbnailLink: (item.thumbnailLink as string) ?? null,
    webViewLink: item.webViewLink as string,
    webContentLink: (item.webContentLink as string) ?? null,
    parents: (item.parents as string[]) ?? [],
    starred: (item.starred as boolean) ?? false,
    trashed: (item.trashed as boolean) ?? false,
    capabilities: (item.capabilities as DriveFile["capabilities"]) ?? {
      canEdit: false,
      canDelete: false,
      canRename: false,
      canMove: false,
      canMoveChildrenIntoDrive: false,
    },
  }
}

function rootFolderId(): string {
  const id = tryGetDriveRootFolderId()
  if (!id) {
    throw new Error(
      "Google Drive workspace folder is not configured. Contact your administrator to set ASPEN_GOOGLE_DRIVE_ROOT_FOLDER_ID."
    )
  }
  return id
}

async function assertFileInWorkspace(fileId: string): Promise<DriveFile> {
  const rootId = rootFolderId()
  const file = await getFile(fileId)

  if (file.id === rootId) return file

  const isDescendant = await isFileInWorkspaceTree(fileId)
  if (!isDescendant) {
    throw new Error("File is outside the Aspen Workspace folder and cannot be accessed.")
  }

  return file
}

async function isFileInWorkspaceTree(fileId: string): Promise<boolean> {
  try {
    const rootId = rootFolderId()
    const token = await getAuthToken()

    const response = await fetch(
      `${DRIVE_API}/files/${fileId}?fields=parents,id`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!response.ok) return false
    const file: { id: string; parents?: string[] } = await response.json()

    if (file.parents?.includes(rootId)) return true

    if (file.parents && file.parents.length > 0) {
      for (const parentId of file.parents) {
        if (await isFileInWorkspaceTree(parentId)) return true
      }
    }

    return false
  } catch {
    return false
  }
}

export async function listFiles(
  folderId?: string,
  options?: DriveSearchOptions
): Promise<DriveFileListResponse> {
  const rootId = rootFolderId()
  const params = new URLSearchParams()

  const folder = folderId ?? rootId
  const query = `trashed = false and '${folder}' in parents`
  params.set("q", query)
  params.set("pageSize", String(options?.pageSize ?? 50))
  params.set("fields", `files(${FIELDS})`)
  if (options?.pageToken) params.set("pageToken", options.pageToken)
  if (options?.orderBy) params.set("orderBy", options.orderBy)

  const data = await driveFetch<{ files: Record<string, unknown>[]; nextPageToken?: string }>(
    `/files?${params.toString()}`
  )

  return {
    files: data.files.map(parseFile),
    nextPageToken: data.nextPageToken ?? null,
  }
}

export async function searchFiles(
  query: string,
  options?: { pageSize?: number; pageToken?: string }
): Promise<DriveFileListResponse> {
  const rootId = rootFolderId()
  const params = new URLSearchParams()
  const safeQuery = query.replace(/'/g, "\\'")
  params.set("q", `trashed = false and '${rootId}' in parents and name contains '${safeQuery}'`)
  params.set("pageSize", String(options?.pageSize ?? 50))
  params.set("fields", `files(${FIELDS})`)
  if (options?.pageToken) params.set("pageToken", options.pageToken)

  const data = await driveFetch<{ files: Record<string, unknown>[]; nextPageToken?: string }>(
    `/files?${params.toString()}`
  )

  return {
    files: data.files.map(parseFile),
    nextPageToken: data.nextPageToken ?? null,
  }
}

export async function getFile(fileId: string): Promise<DriveFile> {
  const params = new URLSearchParams({ fields: FIELDS })
  const data = await driveFetch<Record<string, unknown>>(`/files/${fileId}?${params.toString()}`)
  return parseFile(data)
}

export async function createFolder(
  name: string,
  parentId?: string
): Promise<DriveFile> {
  const rootId = rootFolderId()
  const body: Record<string, unknown> = { name, mimeType: MIME_TYPE_FOLDER }
  body.parents = [parentId && parentId !== "root" ? parentId : rootId]

  const data = await driveFetch<Record<string, unknown>>(`/files?fields=${FIELDS}`, {
    method: "POST",
    body: JSON.stringify(body),
  })

  return parseFile(data)
}

export async function renameFile(fileId: string, newName: string): Promise<DriveFile> {
  await assertFileInWorkspace(fileId)
  const data = await driveFetch<Record<string, unknown>>(`/files/${fileId}?fields=${FIELDS}`, {
    method: "PATCH",
    body: JSON.stringify({ name: newName }),
  })
  return parseFile(data)
}

export async function moveFile(fileId: string, newParentId: string): Promise<DriveFile> {
  const rootId = rootFolderId()

  if (newParentId !== rootId) {
    const isTargetInWorkspace = await isFileInWorkspaceTree(newParentId)
    if (!isTargetInWorkspace) {
      throw new Error("Cannot move files outside the Aspen Workspace folder.")
    }
  }

  await assertFileInWorkspace(fileId)
  const file = await getFile(fileId)
  const prevParents = file.parents.join(",")

  const data = await driveFetch<Record<string, unknown>>(
    `/files/${fileId}?fields=${FIELDS}&addParents=${encodeURIComponent(newParentId)}&removeParents=${encodeURIComponent(prevParents)}`,
    { method: "PATCH" }
  )
  return parseFile(data)
}

export async function trashFile(fileId: string): Promise<DriveFile> {
  await assertFileInWorkspace(fileId)
  const data = await driveFetch<Record<string, unknown>>(`/files/${fileId}?fields=${FIELDS}`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: true }),
  })
  return parseFile(data)
}

export async function restoreFile(fileId: string): Promise<DriveFile> {
  await assertFileInWorkspace(fileId)
  const data = await driveFetch<Record<string, unknown>>(`/files/${fileId}?fields=${FIELDS}`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: false }),
  })
  return parseFile(data)
}

export async function getFolderTree(): Promise<DriveFolderTree[]> {
  const token = await getAuthToken()
  const rootId = rootFolderId()
  return buildFolderTree(rootId, token)
}

async function buildFolderTree(parentId: string, token: string): Promise<DriveFolderTree[]> {
  const params = new URLSearchParams({
    q: `mimeType = '${MIME_TYPE_FOLDER}' and trashed = false and '${parentId}' in parents`,
    pageSize: "100",
    fields: "files(id,name)",
  })

  const response = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) return []

  const data: { files: { id: string; name: string }[] } = await response.json()
  const folders: DriveFolderTree[] = []

  for (const item of data.files) {
    const children = await buildFolderTree(item.id, token)
    folders.push({ id: item.id, name: item.name, children })
  }

  return folders
}

export async function getFileDownloadUrl(fileId: string): Promise<string | null> {
  const file = await assertFileInWorkspace(fileId)
  if (file.mimeType === MIME_TYPE_FOLDER) return null

  const token = await getAuthToken()

  const googleTypes: Record<string, string> = {
    [MIME_TYPE_DOCUMENT]: "application/pdf",
    [MIME_TYPE_SPREADSHEET]: "application/pdf",
    [MIME_TYPE_PRESENTATION]: "application/pdf",
  }

  const exportMime = googleTypes[file.mimeType]
  if (exportMime) {
    const params = new URLSearchParams({ mimeType: exportMime })
    return `${DRIVE_API}/files/${fileId}/export?${params.toString()}`
  }

  return `${DRIVE_API}/files/${fileId}?alt=media&authorization=${encodeURIComponent(`Bearer ${token}`)}`
}

export async function starFile(fileId: string, starred: boolean): Promise<void> {
  await assertFileInWorkspace(fileId)
  await driveFetch(`/files/${fileId}?fields=${FIELDS}`, {
    method: "PATCH",
    body: JSON.stringify({ starred }),
  })
}

export async function getUploadUrl(
  fileName: string,
  mimeType: string,
  fileSize: number,
  parentId?: string
): Promise<{ error: string } | { success: true; uploadUrl: string; fileId: string }> {
  try {
    if (!fileName) return { error: "No file name provided" }

    const userId = await getUserId()
    const token = await getValidAccessToken(userId)
    if (!token) return { error: "Google account not connected" }

    const targetId = parentId && parentId !== "root" ? parentId : rootFolderId()
    if (targetId !== rootFolderId()) {
      const inWorkspace = await isFileInWorkspaceTree(targetId)
      if (!inWorkspace) {
        return { error: "Cannot upload outside the Aspen Workspace folder." }
      }
    }

    const metadata: Record<string, unknown> = {
      name: fileName,
      parents: [targetId],
    }

    const metadataResponse = await fetch(
      `${UPLOAD_API}/files?uploadType=resumable`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": mimeType || "application/octet-stream",
          "X-Upload-Content-Length": String(fileSize),
        },
        body: JSON.stringify(metadata),
      }
    )

    if (!metadataResponse.ok) {
      const err = await metadataResponse.text()
      let parsed: { error?: { message?: string } } = {}
      try { parsed = JSON.parse(err) } catch {}
      return { error: parsed.error?.message ?? `Upload initiation failed (${metadataResponse.status})` }
    }

    const uploadUrl = metadataResponse.headers.get("location")
    if (!uploadUrl) return { error: "No upload URL returned" }

    return { success: true, uploadUrl, fileId: "pending" }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to initiate upload" }
  }
}

export async function uploadFile(
  formData: FormData
): Promise<{ error: string } | { success: true; file: DriveFile }> {
  try {
    const file = formData.get("file") as File | null
    if (!file) return { error: "No file provided" }

    const parentId = (formData.get("parentId") as string) ?? rootFolderId()

    const userId = await getUserId()
    const token = await getValidAccessToken(userId)
    if (!token) return { error: "Google account not connected" }

    const targetId = parentId !== "root" ? parentId : rootFolderId()
    if (targetId !== rootFolderId()) {
      const inWorkspace = await isFileInWorkspaceTree(targetId)
      if (!inWorkspace) {
        return { error: "Cannot upload outside the Aspen Workspace folder." }
      }
    }

    const metadata: Record<string, unknown> = {
      name: file.name,
      parents: [targetId],
    }

    const metadataResponse = await fetch(
      `${UPLOAD_API}/files?uploadType=resumable`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": file.type || "application/octet-stream",
        },
        body: JSON.stringify(metadata),
      }
    )

    if (!metadataResponse.ok) {
      const err = await metadataResponse.text()
      let parsed: { error?: { message?: string } } = {}
      try { parsed = JSON.parse(err) } catch {}
      return { error: parsed.error?.message ?? `Upload initiation failed (${metadataResponse.status})` }
    }

    const uploadUrl = metadataResponse.headers.get("location")
    if (!uploadUrl) return { error: "No upload URL returned" }

    const arrayBuffer = await file.arrayBuffer()
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(arrayBuffer.byteLength),
        "Content-Type": file.type || "application/octet-stream",
      },
      body: arrayBuffer,
    })

    if (!uploadResponse.ok) {
      const err = await uploadResponse.text()
      let parsed: { error?: { message?: string } } = {}
      try { parsed = JSON.parse(err) } catch {}
      return { error: parsed.error?.message ?? "Upload failed" }
    }

    const fileData: Record<string, unknown> = await uploadResponse.json()
    return { success: true, file: parseFile(fileData) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" }
  }
}
