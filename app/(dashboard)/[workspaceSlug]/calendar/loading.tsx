export default function CalendarLoading() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-6">
      <div className="h-6 w-32 animate-pulse rounded bg-secondary" />
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-md bg-secondary/50" />
        ))}
      </div>
    </div>
  )
}
