export default function WorkspaceLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <div className="h-7 w-36 animate-pulse rounded bg-secondary" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 h-4 w-28 animate-pulse rounded bg-secondary" />
            <div className="flex flex-col gap-2">
              <div className="h-8 animate-pulse rounded bg-secondary/60" />
              <div className="h-8 animate-pulse rounded bg-secondary/60" />
              <div className="h-8 animate-pulse rounded bg-secondary/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
