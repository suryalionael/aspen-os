export type Label = { id: string; name: string; color: string }

export const LABEL_COLORS = [
  { value: "green", className: "bg-emerald-200 text-emerald-900" },
  { value: "yellow", className: "bg-yellow-200 text-yellow-900" },
  { value: "orange", className: "bg-orange-200 text-orange-900" },
  { value: "red", className: "bg-red-200 text-red-900" },
  { value: "purple", className: "bg-purple-200 text-purple-900" },
  { value: "blue", className: "bg-blue-200 text-blue-900" },
] as const
