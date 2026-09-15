import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react'

export interface ToastMsg {
  kind: 'success' | 'warning' | 'error'
  text: string
}

export function Toast({ msg, onClose }: { msg: ToastMsg | null; onClose: () => void }): React.ReactNode {
  if (!msg) return null
  const icon =
    msg.kind === 'success' ? (
      <CheckCircle2 size={16} className="text-ok shrink-0" />
    ) : msg.kind === 'warning' ? (
      <AlertTriangle size={16} className="text-warn shrink-0" />
    ) : (
      <XCircle size={16} className="text-danger shrink-0" />
    )
  return (
    <div role="status" className="fixed top-16 right-6 z-50 fade-up max-w-md">
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-line bg-panel-2 shadow-xl shadow-black/40">
        {icon}
        <span className="text-sm leading-snug">{msg.text}</span>
        <button className="text-zinc-500 hover:text-zinc-200 shrink-0 ml-1 cursor-pointer" aria-label="×" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
