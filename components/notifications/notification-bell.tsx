"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"

import {
  checkDueTodayNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/lib/actions/notifications"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const TYPE_LABELS: Record<string, string> = {
  assigned: "Assigned",
  mentioned: "Mentioned",
  commented: "Comment",
  checklist_completed: "Checklist",
  due_today: "Due today",
}

export function NotificationBell({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string
  workspaceSlug: string
}) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const unreadCount = notifications.filter((notification) => !notification.read_at).length

  async function refresh() {
    const result = await getNotifications()
    if ("success" in result) setNotifications(result.notifications)
  }

  // Runs once per workspace, not gated on the dialog being open, so the
  // unread badge is accurate even before the user ever opens the bell.
  useEffect(() => {
    let active = true
    checkDueTodayNotifications(workspaceId).then(() => {
      if (!active) return
      refresh().then(() => setLoading(false))
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  // Realtime: a new notification (e.g. a teammate just assigned you a
  // task) updates the badge live. Same setAuth-before-subscribe ordering
  // as KanbanBoard's task subscription (DEC-023) — without it the channel
  // reaches SUBSCRIBED but never actually receives postgres_changes events.
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return
      supabase.realtime.setAuth(data.session.access_token)
      channel = supabase
        .channel(`notifications-${data.session.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${data.session.user.id}`,
          },
          (payload) => {
            setNotifications((previous) => [payload.new as Notification, ...previous])
          }
        )
        .subscribe()
    })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  function handleMarkRead(notification: Notification) {
    if (notification.read_at) return
    setNotifications((previous) =>
      previous.map((existing) =>
        existing.id === notification.id
          ? { ...existing, read_at: new Date().toISOString() }
          : existing
      )
    )
    markNotificationRead(notification.id)
  }

  function handleMarkAllRead() {
    const now = new Date().toISOString()
    setNotifications((previous) =>
      previous.map((existing) => (existing.read_at ? existing : { ...existing, read_at: now }))
    )
    markAllNotificationsRead()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span
              data-testid="unread-badge"
              className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            You&apos;re all caught up
          </p>
        ) : (
          <>
            {unreadCount > 0 && (
              <Button size="sm" variant="outline" onClick={handleMarkAllRead} className="self-start">
                Mark all read
              </Button>
            )}
            <ul className="flex flex-col gap-1.5">
              {notifications.map((notification) => {
                const content = (
                  <div
                    className={`flex flex-col gap-0.5 rounded-md border border-border p-2 text-sm ${
                      notification.read_at ? "" : "bg-secondary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {TYPE_LABELS[notification.type] ?? notification.type}
                      </span>
                      {!notification.read_at && (
                        <span className="size-2 rounded-full bg-primary" aria-hidden />
                      )}
                    </div>
                    <span>{notification.message}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(notification.created_at).toLocaleString()}
                    </span>
                  </div>
                )

                return (
                  <li key={notification.id} data-testid="notification-item">
                    {notification.task_id && notification.project_id ? (
                      <Link
                        href={`/${workspaceSlug}/${notification.project_id}?task=${notification.task_id}`}
                        onClick={() => handleMarkRead(notification)}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(notification)}
                        className="w-full text-left"
                      >
                        {content}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
