export default function NotesLoading() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-6">
      <div className="h-6 w-24 animate-pulse rounded bg-secondary" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg bg-secondary/50" />
        ))}
      </div>
    </div>
  )
}
