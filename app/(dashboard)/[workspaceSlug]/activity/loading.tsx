export default function ActivityLoading() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-6">
      <div className="h-6 w-24 animate-pulse rounded bg-secondary" />
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="h-5 animate-pulse rounded bg-secondary/50" />
      ))}
    </div>
  )
}
