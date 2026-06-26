export function TaskCard({ title }: { title: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm shadow-sm">
      {title}
    </div>
  )
}
