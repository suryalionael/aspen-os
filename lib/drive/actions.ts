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
const FIELDS =
  "files(id,name,mimeType,size,modifiedTime,createdTime,owners,lastModifyingUser,iconLink,thumbnailLink,webViewLink,webContentLink,parents,starred,trashed,capabilities)"

async function getUserId(): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getSession()
  if (!data.session?.user) throw new Error("Not authenticated")
  return data.session.user.id
}

async function driveFetch<T>(
  path: string,
  options?: RequestInit & { userId?: string }
): Promise<T> {
  const userId = options?.userId ?? (await getUserId())
  const token = await getValidAccessToken(userId)
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
    const error = await response.text()
    throw new Error(`Drive API error: ${error}`)
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
    const userId = await getUserId()
    const token = await getValidAccessToken(userId)
    if (!token) return false

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
  params.set("fields", FIELDS)
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
  params.set("fields", FIELDS)
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
  const prev = file.parents.join(",")

  const data = await driveFetch<Record<string, unknown>>(
    `/files/${fileId}?fields=${FIELDS}&addParents=${newParentId}&removeParents=${prev}`,
    { method: "PATCH" }
  )
  return parseFile(data)
}

export async function deleteFile(fileId: string): Promise<void> {
  await assertFileInWorkspace(fileId)
  await driveFetch(`/files/${fileId}`, { method: "DELETE" })
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

export async function listRecentFiles(pageSize = 20): Promise<DriveFileListResponse> {
  const rootId = rootFolderId()
  const params = new URLSearchParams({
    q: `trashed = false and '${rootId}' in parents`,
    pageSize: String(pageSize),
    fields: FIELDS,
    orderBy: "modifiedTime desc",
  })

  const data = await driveFetch<{ files: Record<string, unknown>[]; nextPageToken?: string }>(
    `/files?${params.toString()}`
  )

  return {
    files: data.files.map(parseFile),
    nextPageToken: data.nextPageToken ?? null,
  }
}

export async function listTrashedFiles(pageSize = 50): Promise<DriveFileListResponse> {
  const rootId = rootFolderId()
  const params = new URLSearchParams({
    q: `trashed = true and '${rootId}' in parents`,
    pageSize: String(pageSize),
    fields: FIELDS,
  })

  const data = await driveFetch<{ files: Record<string, unknown>[]; nextPageToken?: string }>(
    `/files?${params.toString()}`
  )

  return {
    files: data.files.map(parseFile),
    nextPageToken: data.nextPageToken ?? null,
  }
}

export async function getFolderTree(): Promise<DriveFolderTree[]> {
  const userId = await getUserId()
  const token = await getValidAccessToken(userId)
  if (!token) return []

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

export async function getGoogleDriveFileListSnapshot(
  folderId?: string,
  pageSize = 100
): Promise<DriveFileListResponse> {
  return listFiles(folderId, { pageSize })
}

export async function getFileDownloadUrl(fileId: string): Promise<string | null> {
  const file = await assertFileInWorkspace(fileId)
  if (file.mimeType === MIME_TYPE_FOLDER) return null

  const exportMap: Record<string, string> = {
    [MIME_TYPE_DOCUMENT]: "application/pdf",
    [MIME_TYPE_SPREADSHEET]: "application/pdf",
    [MIME_TYPE_PRESENTATION]: "application/pdf",
  }

  const mimeType = exportMap[file.mimeType]
  const params = mimeType ? `?mimeType=${encodeURIComponent(mimeType)}` : "?alt=media"
  return `${DRIVE_API}/files/${fileId}/export${params}`
}

export async function starFile(fileId: string, starred: boolean): Promise<void> {
  await assertFileInWorkspace(fileId)
  await driveFetch(`/files/${fileId}`, {
    method: "PATCH",
    body: JSON.stringify({ starred }),
  })
}

export async function uploadFile(
  formData: FormData
): Promise<{ error: string } | { success: true; file: DriveFile }> {
  try {
    const file = formData.get("file") as File | null
    const parentId = (formData.get("parentId") as string) ?? rootFolderId()

    if (!file) return { error: "No file provided" }

    const userId = await getUserId()
    const token = await getValidAccessToken(userId)
    if (!token) return { error: "Google account not connected" }

    const headers: HeadersInit = { Authorization: `Bearer ${token}` }

    const metadata: Record<string, unknown> = { name: file.name }
    if (parentId && parentId !== "root") {
      const targetId = parentId
      if (targetId !== rootFolderId()) {
        const inWorkspace = await isFileInWorkspaceTree(targetId)
        if (!inWorkspace) {
          return { error: "Cannot upload outside the Aspen Workspace folder." }
        }
      }
      metadata.parents = [targetId]
    }

    const metadataResponse = await fetch(`${DRIVE_API}/files?fields=${FIELDS}&uploadType=resumable`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": file.type || "application/octet-stream",
        "X-Upload-Content-Length": String(file.size),
      },
      body: JSON.stringify(metadata),
    })

    if (!metadataResponse.ok) {
      const err = await metadataResponse.text()
      return { error: `Failed to initiate upload: ${err}` }
    }

    const uploadUrl = metadataResponse.headers.get("location")
    if (!uploadUrl) return { error: "No upload URL returned" }

    const buffer = Buffer.from(await file.arrayBuffer())
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(buffer.length),
        "Content-Type": file.type || "application/octet-stream",
      },
      body: buffer,
    })

    if (!uploadResponse.ok) {
      const err = await uploadResponse.text()
      return { error: `Upload failed: ${err}` }
    }

    const fileData: Record<string, unknown> = await uploadResponse.json()
    return { success: true, file: parseFile(fileData) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" }
  }
}
