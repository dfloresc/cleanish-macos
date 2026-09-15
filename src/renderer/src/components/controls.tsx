import { ChevronDown, Search } from 'lucide-react'

export interface SortOption<T extends string> {
  value: T
  label: string
}

interface SortSelectProps<T extends string> {
  label: string
  value: T
  options: SortOption<T>[]
  onChange: (value: T) => void
}

export function SortSelect<T extends string>({ label, value, options, onChange }: SortSelectProps<T>): React.ReactNode {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-500">
      <span className="shrink-0">{label}</span>
      <div className="relative">
        <select
          className="input appearance-none pr-7 py-1.5 text-xs cursor-pointer"
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
        />
      </div>
    </label>
  )
}

export function FilterChip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.ReactNode {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
        active
          ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
          : 'bg-panel-2 border-line text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

export function SearchBox({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}): React.ReactNode {
  return (
    <div className="relative flex-1 min-w-44 max-w-sm">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
      <input
        className="input w-full pl-9 py-1.5 text-xs"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
