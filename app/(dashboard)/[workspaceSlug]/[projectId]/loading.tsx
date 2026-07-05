const SKELETON_COLUMNS = [
  { label: "Backlog", count: 2 },
  { label: "To Do", count: 3 },
  { label: "In Progress", count: 2 },
  { label: "Done", count: 1 },
]

export default function ProjectLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <div className="h-6 w-52 animate-pulse rounded-md bg-secondary" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-7 w-16 animate-pulse rounded-md bg-secondary/70" />
          ))}
        </div>
        <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
          {SKELETON_COLUMNS.map(({ label, count }) => (
            <div
              key={label}
              className="flex w-72 flex-shrink-0 flex-col gap-3 rounded-xl bg-secondary/30 p-3.5"
            >
              <div className="flex items-center gap-2 px-0.5">
                <div className="h-3.5 w-20 animate-pulse rounded bg-secondary" />
                <div className="ml-auto h-4 w-5 animate-pulse rounded-full bg-secondary" />
              </div>
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: count }, (_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-xl border border-border/40 bg-card p-4"
                    style={{ height: i === 0 ? "72px" : "56px" }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
