export function tryGetDriveRootFolderId(): string | null {
  return process.env.ASPEN_GOOGLE_DRIVE_ROOT_FOLDER_ID ?? null
}

export function getDriveRootFolderId(): string {
  const id = tryGetDriveRootFolderId()
  if (!id) {
    throw new Error(
      "Missing ASPEN_GOOGLE_DRIVE_ROOT_FOLDER_ID. Set it in your environment variables to the Google Drive folder ID that serves as the Aspen OS workspace root."
    )
  }
  return id
}
