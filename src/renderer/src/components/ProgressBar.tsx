interface Props {
  percent?: number
  label?: string
}

export function ProgressBar({ percent, label }: Props): React.ReactNode {
  const indeterminate = percent === undefined
  return (
    <div className="w-full">
      {label && <p className="text-xs text-zinc-500 mb-2 truncate">{label}</p>}
      <div className="h-2 rounded-full bg-panel-2 overflow-hidden">
        {indeterminate ? (
          <div className="h-full w-full progress-indeterminate rounded-full" />
        ) : (
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        )}
      </div>
    </div>
  )
}
