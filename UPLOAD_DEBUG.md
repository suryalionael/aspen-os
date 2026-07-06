# Upload Debug Report

Generated: 2026-07-06

---

## 1. Root Cause: Storage Buckets Do Not Exist

**Status: CONFIRMED — production Supabase project has zero Storage buckets.**

```
GET https://kehumsoipwvrzkomfyey.supabase.co/storage/v1/bucket/avatars
  → 404 {"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}

GET https://kehumsoipwvrzkomfyey.supabase.co/storage/v1/bucket/task-attachments
  → 404 {"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}
```

Three buckets required by the app do not exist in production:

| Bucket | Created By | Status |
|--------|-----------|--------|
| `avatars` | Migration `021_avatars_bucket.sql` | **Not found** |
| `task-attachments` | Migration `022_task_attachments.sql` | **Not found** |
| `workspace-logos` | Migration `026_workspace_settings.sql` | **Not found** |

---

## 2. How Each Upload Fails

### Task Attachment Upload (`uploadAttachment` in `lib/actions/attachments.ts`)

```
Server Action: uploadAttachment
  1. Creates Supabase client ✓
  2. Validates file (size < 10 MB, non-empty) ✓
  3. Calls: supabase.storage.from("task-attachments").upload(path, file, ...)
     → Rejects with error: "Bucket not found" — caught at line 109
  4. Returns { error: "Bucket not found" }
  5. Retries: supabase.from("task_attachments").insert(...) // database insert
     → Actually REACHES this point (lines 113-124) because the upload
       rejection does NOT throw — it returns an error object from
       supabase.storage.upload()
```

Wait — `supabase.storage.from("task-attachments").upload()` returns `{ error: { message: "Bucket not found" } }`, it does NOT throw. So the code at line 109 (`if (uploadError)`) catches this and returns the error. The database insert is NEVER reached.

**Result:** User sees "Bucket not found" error message in the UI.

### Avatar Upload (`uploadAvatar` in `lib/actions/profile.ts`)

```
Server Action: uploadAvatar
  1. Validates file (image, < 2 MB) ✓
  2. Calls: supabase.storage.from("avatars").upload(path, file, { upsert: true })
     → Returns { error: { message: "Bucket not found" } }
  3. Returns { error: "Bucket not found" }
```

### Workspace Logo Upload (`uploadWorkspaceLogo` in `lib/actions/workspace-settings.ts`)

```
Server Action: uploadWorkspaceLogo
  1. Validates file (image, < 2 MB) ✓
  2. Calls: supabase.storage.from("workspace-logos").upload(path, file, { upsert: true })
     → Returns { error: { message: "Bucket not found" } }
  3. Returns { error: "Bucket not found" }
```

---

## 3. The "Something went wrong" Error Boundary

The e2e test (`e2e/uploads.spec.ts`) checks that "Something went wrong" is NOT visible. This error appears when an unhandled exception propagates to the nearest `error.tsx` boundary.

Previously (before Sprint 2 fixes), the upload hit the error boundary because:

1. Next.js default `bodySizeLimit` (1 MB) was lower than the app's validation (2 MB for logos/avatars, 10 MB for attachments)
2. Logo upload used `<form action={serverAction}>` inside a Radix Portal, which silently fails for file inputs

**Both of these are now fixed:**
- `bodySizeLimit: "4mb"` in `next.config.ts`
- Logo/avatar uploads call the action directly (same pattern as TaskAttachments)

**However**, the storage bucket issue means uploads will return a friendly error message ("Bucket not found") rather than hitting the error boundary. The "Something went wrong" boundary test should pass, but the upload will still fail with an unhelpful error message.

---

## 4. Missing Migrations

The three Storage bucket migrations were never applied to the production Supabase project:

| Migration | Purpose | Applied to Production? |
|-----------|---------|----------------------|
| `021_avatars_bucket.sql` | Creates `avatars` bucket + RLS policies | ❌ |
| `022_task_attachments.sql` | Creates `task-attachments` bucket + RLS + `task_attachments` table | ❌ |
| `026_workspace_settings.sql` | Creates `workspace-logos` bucket + RLS + workspace columns | Partial (columns exist, bucket does not) |

The `task_attachments` database TABLE might exist (the RLS policy for it works separately from the Storage bucket), but without the bucket, uploads fail at the `supabase.storage.from("X").upload()` step.

### How to Verify

Check if the database table exists (it's created in migration 022, separate from the bucket):
```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'task_attachments'
);
```

Check Storage buckets (via SQL in Supabase dashboard):
```sql
SELECT * FROM storage.buckets WHERE id IN ('avatars', 'task-attachments', 'workspace-logos');
```

---

## 5. RLS Policy Status

Even if buckets were created, the RLS policies from the migrations also need to exist:

### `avatars` (Public bucket — read:public, write:self)

Expected: `SELECT` → public, `INSERT` → `auth.uid() = (foldername(name))[1]`, `UPDATE` → same, `DELETE` → same

Status: **Not created** (bucket doesn't exist)

### `task-attachments` (Private bucket — read:members, write:members)

Expected: `SELECT/INSERT/DELETE` → `is_workspace_member_for_task((foldername(name))[1]::uuid)`

Status: **Not created** (bucket doesn't exist)

### `workspace-logos` (Public bucket — read:public, write:admin/owner)

Expected: `SELECT` → public, `INSERT` → `is_workspace_admin_or_owner((foldername(name))[1]::uuid)`, `UPDATE` → same, `DELETE` → same

Status: **Not created** (bucket doesn't exist)

---

## 6. Impact Assessment

| Upload Type | Production Status | User Impact |
|-------------|------------------|-------------|
| Task attachment upload | **Broken** — "Bucket not found" | Cannot attach files to tasks |
| Avatar upload | **Broken** — "Bucket not found" | Cannot set profile picture |
| Workspace logo upload | **Broken** — "Bucket not found" | Cannot set workspace logo |
| Attachment display (signed URLs) | **Broken** — `createSignedUrl` on nonexistent bucket | Existing attachments not viewable |
| Workspace settings (general) | **Works** — no Storage dependency | OK |
| Account/profile (general) | **Works** — no Storage dependency | OK |

## 7. Environment Variable Check

```
NEXT_PUBLIC_SUPABASE_URL  = https://kehumsoipwvrzkomfyey.supabase.co  ✓
NEXT_PUBLIC_SUPABASE_ANON_KEY = sb_publishable_... ✓
SUPABASE_SERVICE_ROLE_KEY = Not checked (never set in env files)
```

The anon key is present and valid (works for REST API calls). The service role key is not in `.env.local` or `.env`, which is expected — it should only be set in the Vercel project environment variables (used by `lib/supabase/admin.ts` for `deleteUser`).

---

## 8. Summary

```
ROOT CAUSE: SQL migrations 021, 022, and 026 were never applied to the
production Supabase project. The Storage buckets don't exist.

FIX: Run the migrations against the production database:
  1. supabase link --project-ref kehumsoipwvrzkomfyey
  2. supabase db push

Or manually create the buckets + policies via the Supabase Dashboard:
  1. Storage → Create bucket "avatars" (public)
  2. Storage → Create bucket "task-attachments" (private)
  3. Storage → Create bucket "workspace-logos" (public)
  4. Apply the RLS policies from migrations 021, 022, and 026
```
