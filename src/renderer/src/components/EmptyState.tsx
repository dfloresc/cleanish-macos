import { Inbox } from 'lucide-react'

export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }): React.ReactNode {
  return (
    <div className="card flex flex-col items-center justify-center py-16 gap-3 fade-up">
      <div className="w-12 h-12 rounded-2xl bg-panel-2 border border-line flex items-center justify-center text-zinc-500">
        <Inbox size={22} />
      </div>
      <p className="text-sm text-zinc-500">{text}</p>
      {action}
    </div>
  )
}
