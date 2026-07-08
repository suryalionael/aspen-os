export function getDriveRootFolderId(): string {
  const folderId = process.env.ASPEN_GOOGLE_DRIVE_ROOT_FOLDER_ID

  if (!folderId) {
    throw new Error(
      "Missing ASPEN_GOOGLE_DRIVE_ROOT_FOLDER_ID. Set it in your .env.local file to the Google Drive folder ID that serves as the Aspen OS workspace root."
    )
  }

  return folderId
}

export function buildWorkspaceQuery(baseQuery: string): string {
  const rootId = getDriveRootFolderId()
  return `('${rootId}' in parents or '${rootId}' in owners) and ${baseQuery}`
}

export function buildScopedQuery(additionalClauses: string): string {
  const rootId = getDriveRootFolderId()
  return `'${rootId}' in parents and trashed = false${additionalClauses ? ` and ${additionalClauses}` : ""}`
}
