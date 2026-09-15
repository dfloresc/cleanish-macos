import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
  busy?: boolean
}

export function Modal({ title, onClose, children, footer, wide, busy }: Props): React.ReactNode {
  const titleId = useId()
  const container = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    container.current?.focus()
    return () => previous?.focus()
  }, [])
  return createPortal(
    <div ref={container} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) onClose()
        if (event.key === 'Tab') {
          const elements = container.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')
          if (!elements?.length) { event.preventDefault(); return }
          const first = elements[0], last = elements[elements.length - 1]
          if (event.shiftKey && (document.activeElement === first || document.activeElement === container.current)) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === container.current)) { event.preventDefault(); first.focus() }
        }
      }} className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} mx-6 shadow-2xl fade-up flex flex-col max-h-[80vh]`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h3 id={titleId} className="font-semibold text-[15px]">{title}</h3>
          <button disabled={busy} aria-label={t('common.close')} className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-line flex justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>, document.body
  )
}
