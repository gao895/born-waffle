import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ToastMessage } from '../types/mapping'

const ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
}

const COLORS: Record<ToastMessage['kind'], string> = {
  success: 'border-emerald-500/40 bg-emerald-950/80 text-emerald-100',
  warning: 'border-amber-500/40 bg-amber-950/80 text-amber-100',
  error: 'border-red-500/40 bg-red-950/80 text-red-100',
  info: 'border-slate-500/40 bg-slate-800/90 text-slate-100',
}

interface ToastStackProps {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind]
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${COLORS[toast.kind]}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{toast.text}</span>
            <button type="button" onClick={() => onDismiss(toast.id)} className="text-current/70 hover:text-current">
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
