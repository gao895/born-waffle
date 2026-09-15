import { CheckCircle2, Loader2 } from 'lucide-react'
import type { StepState } from '../types/mapping'

interface ProgressBarProps {
  steps: StepState[]
  busyLabel: string | null
}

export function ProgressBar({ steps, busyLabel }: ProgressBarProps) {
  return (
    <div className="border-t border-slate-800 bg-slate-900/80 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {steps.map((step, i) => (
          <div key={step.step} className="flex items-center gap-2 text-sm">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                step.status === 'done'
                  ? 'bg-emerald-500 text-white'
                  : step.status === 'active'
                    ? 'bg-violet-500 text-white'
                    : step.status === 'error'
                      ? 'bg-red-500 text-white'
                      : 'bg-slate-700 text-slate-400'
              }`}
            >
              {step.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={step.status === 'pending' ? 'text-slate-500' : 'text-slate-200'}>{step.label}</span>
          </div>
        ))}
      </div>
      {busyLabel && (
        <div className="mt-2 flex items-center gap-2 text-xs text-violet-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {busyLabel}
        </div>
      )}
    </div>
  )
}
