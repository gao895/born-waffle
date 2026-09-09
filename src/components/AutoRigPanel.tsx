import { AlertTriangle, Loader2, Wand2 } from 'lucide-react'

interface AutoRigPanelProps {
  autoRigging: boolean
  autoRigError: string | null
  onRunAutoRig: () => void
}

export function AutoRigPanel({ autoRigging, autoRigError, onRunAutoRig }: AutoRigPanelProps) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
      <div>
        <p className="font-medium">このモデルにはボーンがありません。</p>
        <p className="mt-1 text-xs opacity-80">
          モデルの形状からAIが人型ボーンを自動生成できます（β版・完全な精度は保証されません）。
        </p>
      </div>

      <button
        type="button"
        disabled={autoRigging}
        onClick={onRunAutoRig}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {autoRigging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {autoRigging ? 'ボーンを自動生成しています…' : 'AIで自動リギングする'}
      </button>

      {autoRigError && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{autoRigError}</p>
        </div>
      )}
    </div>
  )
}
