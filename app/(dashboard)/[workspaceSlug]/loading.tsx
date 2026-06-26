export default function WorkspaceLoading() {
  return (
    <div className="flex flex-1">
      <aside className="flex w-56 flex-shrink-0 flex-col gap-3 border-r border-border p-4">
        <div className="h-5 w-20 animate-pulse rounded bg-secondary" />
        <div className="flex flex-col gap-1.5">
          <div className="h-7 animate-pulse rounded-md bg-secondary" />
          <div className="h-7 animate-pulse rounded-md bg-secondary" />
        </div>
      </aside>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="h-4 w-64 animate-pulse rounded bg-secondary" />
      </div>
    </div>
  )
}
