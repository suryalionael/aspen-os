# Attachment Upload Execution Chain Probe

**Generated at**: 2026-07-07T02:17:26.115Z

## 1. Execution Steps

| # | Step | Est. Executed | Evidence |
|---|------|--------------|----------|
| 1 | File input receives file via `setFiles()` | `YES` | Playwright `fileChooser.setFiles()` returned |
| 2 | `onChange` fires on `<input type="file">` | | `ADD_EVENT_LISTENER` in trace |
| 3 | `handleFileChange` starts | | Check for storage upload fetch |
| 4 | `startTransition` callback executes | | Check for server action fetch after storage upload |
| 5 | `createAttachmentRecord()` invoked | | Check for server action fetch with this action ID |
| 6 | React server action proxy called | | `window.fetch` called with `Next-Action` header |
| 7 | `fetch()` dispatched to network | | Playwright `page.on('request')` captured |
| 8 | Server code starts executing | | Server responded (HTTP response received) |

## 2. Test Log

```
### 1. Auth
- Sign up at https://aspen-os.vercel.app/sign-up
- Post-sign-up URL: https://aspen-os.vercel.app/sign-up
- Account exists, signing in instead
- Post-sign-in URL: https://aspen-os.vercel.app/
### 2. Workspace creation
- Submitting workspace form...
- Redirected to: https://aspen-os.vercel.app/probe-1783390598939
- Workspace slug: probe-1783390598939
- Project: a765b45f-2081-47ab-8a30-4256c231cb47 Tasks: 4
### 3. Opening dialog
- Dialog open: true File inputs: 1
### 4. Instrumentation injection
- Instruments injected after page load
- Pre-upload trace events: 1
### 5. Upload trigger
- File chooser opened
- fileChooser.setFiles() called at t= 1783390637731
- ATTACHMENT ITEM APPEARED
```

## 3. Final DOM State

```json
{
  "items": 1,
  "uploading": false,
  "alerts": [],
  "dialog": true
}
```

## 4. Instrumented fetch() calls (chronological)

All calls to `window.fetch` captured after instrumentation injection:

| # | dt(ms) | Method | Next-Action | Multipart | Content-Type | URL |
|---|--------|--------|-------------|-----------|-------------|-----|
| 0 | 11 | POST | 405d7d08a91706b3505b | false |  | /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47 |
| 1 | 37 | POST |  | false |  | https://kehumsoipwvrzkomfyey.supabase.co/storage/v1/object/task-attach |
| 2 | 609 | POST | 6034549566adbaed5dda | false |  | /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47 |
| 3 | 1192 | POST | 4076f971032c1ebbcbb5 | false |  | /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47 |
| 4 | 1829 | POST | 4095874715e9ec26dcfd | false |  | /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47 |
| 5 | 2644 | POST | 4070e004981889125b6c | false |  | /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47 |
| 6 | 3245 | POST | 40ef96b2ebdb56648403 | false |  | /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47 |
| 7 | 3833 | POST | 40b21797bc9e16fafcbd | false |  | /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47 |
| 8 | 4499 | POST | 7ce80942ff81b69a6f83 | false |  | /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47 |
| 9 | 7099 | POST | 40cb0bef2d6b320bf4ec | false |  | /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47 |
| 10 | 7878 | POST | 40cb0bef2d6b320bf4ec | false |  | /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47 |

### Full body previews

**#0** (+11ms) `POST /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47`
  Body: ["81e04107-5a3a-402c-b9ab-3eeb6874702e"]

**#1** (+37ms) `POST https://kehumsoipwvrzkomfyey.supabase.co/storage/v1/object/task-attachments/81e0`
  Body: FormData{cacheControl=3600, =[File test-attachment.txt 32B text/plain]}

**#2** (+609ms) `POST /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47`
  Body: ["a765b45f-2081-47ab-8a30-4256c231cb47","81e04107-5a3a-402c-b9ab-3eeb6874702e"]

**#3** (+1192ms) `POST /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47`
  Body: ["81e04107-5a3a-402c-b9ab-3eeb6874702e"]

**#4** (+1829ms) `POST /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47`
  Body: ["a765b45f-2081-47ab-8a30-4256c231cb47"]

**#5** (+2644ms) `POST /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47`
  Body: ["81e04107-5a3a-402c-b9ab-3eeb6874702e"]

**#6** (+3245ms) `POST /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47`
  Body: ["81e04107-5a3a-402c-b9ab-3eeb6874702e"]

**#7** (+3833ms) `POST /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47`
  Body: ["81e04107-5a3a-402c-b9ab-3eeb6874702e"]

**#8** (+4499ms) `POST /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47`
  Body: ["81e04107-5a3a-402c-b9ab-3eeb6874702e","test-attachment.txt","81e04107-5a3a-402c-b9ab-3eeb6874702e/...

**#9** (+7099ms) `POST /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47`
  Body: ["81e04107-5a3a-402c-b9ab-3eeb6874702e"]

**#10** (+7878ms) `POST /probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231cb47`
  Body: ["81e04107-5a3a-402c-b9ab-3eeb6874702e"]

## 5. React State Snapshots (every 200ms)

Time is relative to `setFiles()` call.

```
t=205ms uploading=true items=0 alerts=[] traceLen=3
t=407ms uploading=true items=0 alerts=[] traceLen=3
t=606ms uploading=true items=0 alerts=[] traceLen=4
t=811ms uploading=true items=0 alerts=[] traceLen=4
t=1012ms uploading=true items=0 alerts=[] traceLen=4
t=1212ms uploading=true items=0 alerts=[] traceLen=5
t=1412ms uploading=true items=0 alerts=[] traceLen=5
t=1615ms uploading=true items=0 alerts=[] traceLen=5
t=1814ms uploading=true items=0 alerts=[] traceLen=6
t=2015ms uploading=true items=0 alerts=[] traceLen=6
t=2216ms uploading=true items=0 alerts=[] traceLen=6
t=2419ms uploading=true items=0 alerts=[] traceLen=6
t=2619ms uploading=true items=0 alerts=[] traceLen=6
t=2817ms uploading=true items=0 alerts=[] traceLen=7
t=3020ms uploading=true items=0 alerts=[] traceLen=7
t=3223ms uploading=true items=0 alerts=[] traceLen=8
t=3422ms uploading=true items=0 alerts=[] traceLen=8
t=3623ms uploading=true items=0 alerts=[] traceLen=8
t=3823ms uploading=true items=0 alerts=[] traceLen=9
t=4024ms uploading=true items=0 alerts=[] traceLen=9
t=4224ms uploading=true items=0 alerts=[] traceLen=9
t=4425ms uploading=true items=0 alerts=[] traceLen=9
t=4624ms uploading=true items=0 alerts=[] traceLen=10
t=4827ms uploading=true items=0 alerts=[] traceLen=10
t=5028ms uploading=true items=0 alerts=[] traceLen=10
t=5228ms uploading=true items=0 alerts=[] traceLen=10
t=5429ms uploading=true items=0 alerts=[] traceLen=10
t=5630ms uploading=true items=0 alerts=[] traceLen=10
t=5832ms uploading=true items=0 alerts=[] traceLen=10
t=6032ms uploading=true items=0 alerts=[] traceLen=10
t=6233ms uploading=true items=0 alerts=[] traceLen=10
t=6433ms uploading=true items=0 alerts=[] traceLen=10
t=6636ms uploading=true items=0 alerts=[] traceLen=10
t=6837ms uploading=true items=0 alerts=[] traceLen=10
t=7038ms uploading=true items=0 alerts=[] traceLen=10
t=7234ms uploading=false items=1 alerts=[] traceLen=11
```

## 6. All POST requests (Playwright network capture)

```
#0 [1783390637720] action=405d7d08a91706b3505b text/plain;charset=UTF-8 https://aspen-os.vercel.app/probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231
#1 [1783390637747] (no action) multipart/form-data; boundary=----WebKitFormBounda https://kehumsoipwvrzkomfyey.supabase.co/storage/v1/object/task-attachments/81e0
#2 [1783390638320] action=6034549566adbaed5dda text/plain;charset=UTF-8 https://aspen-os.vercel.app/probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231
#3 [1783390638902] action=4076f971032c1ebbcbb5 text/plain;charset=UTF-8 https://aspen-os.vercel.app/probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231
#4 [1783390639540] action=4095874715e9ec26dcfd text/plain;charset=UTF-8 https://aspen-os.vercel.app/probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231
#5 [1783390640354] action=4070e004981889125b6c text/plain;charset=UTF-8 https://aspen-os.vercel.app/probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231
#6 [1783390640955] action=40ef96b2ebdb56648403 text/plain;charset=UTF-8 https://aspen-os.vercel.app/probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231
#7 [1783390641543] action=40b21797bc9e16fafcbd text/plain;charset=UTF-8 https://aspen-os.vercel.app/probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231
#8 [1783390642210] action=7ce80942ff81b69a6f83 text/plain;charset=UTF-8 https://aspen-os.vercel.app/probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231
#9 [1783390644809] action=40cb0bef2d6b320bf4ec text/plain;charset=UTF-8 https://aspen-os.vercel.app/probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231
#10 [1783390645589] action=40cb0bef2d6b320bf4ec text/plain;charset=UTF-8 https://aspen-os.vercel.app/probe-1783390598939/a765b45f-2081-47ab-8a30-4256c231
```

## 7. addEventListener registrations on file inputs

```
(none)
```

## 8. Conclusion

**CHAIN COMPLETE**: The attachment item appeared in the DOM. All 8 steps executed successfully.
