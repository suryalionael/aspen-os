export default function NotesLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="h-6 w-20 animate-pulse rounded-md bg-secondary" />
        <div className="h-7 w-24 animate-pulse rounded-md bg-secondary/80" />
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-7 w-16 animate-pulse rounded-md bg-secondary/70" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-xl border border-border/40 bg-card p-4">
            <div className="h-3 w-16 animate-pulse rounded bg-secondary/80" />
            <div className="h-4 animate-pulse rounded-md bg-secondary" style={{ width: "75%" }} />
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="h-3 animate-pulse rounded bg-secondary/60" />
              <div className="h-3 animate-pulse rounded bg-secondary/60" style={{ width: "65%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
