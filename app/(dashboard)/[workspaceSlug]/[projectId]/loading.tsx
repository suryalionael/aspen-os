const SKELETON_COLUMNS = ["Backlog", "To Do", "In Progress", "Done"]

export default function ProjectLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <div className="h-6 w-48 animate-pulse rounded bg-secondary" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="flex flex-1 gap-4 overflow-x-auto">
          {SKELETON_COLUMNS.map((label) => (
            <div
              key={label}
              className="flex w-72 flex-shrink-0 flex-col gap-3 rounded-lg bg-secondary/50 p-3"
            >
              <h3 className="px-1 text-sm font-semibold text-muted-foreground">
                {label}
              </h3>
              <div className="flex flex-col gap-2">
                <div className="h-14 animate-pulse rounded-md bg-card" />
                <div className="h-14 animate-pulse rounded-md bg-card" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
