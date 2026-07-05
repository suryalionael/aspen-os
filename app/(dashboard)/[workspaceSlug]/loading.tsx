export default function WorkspaceLoading() {
  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
      <div className="h-7 w-40 animate-pulse rounded-md bg-secondary" />
      <div className="flex gap-2">
        <div className="h-7 w-20 animate-pulse rounded-md bg-secondary/80" />
        <div className="h-7 w-24 animate-pulse rounded-md bg-secondary/80" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 h-4 w-32 animate-pulse rounded-md bg-secondary" />
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-7 animate-pulse rounded-md bg-secondary/50" style={{ width: `${85 - i * 10}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
