import { Bone, RefreshCw } from 'lucide-react'
import type { ViewDirection } from '../three/SceneManager'

interface ViewerControlsProps {
  onSetView: (direction: ViewDirection) => void
  bonesVisible: boolean
  onToggleBones: (visible: boolean) => void
  disabled: boolean
}

const VIEW_BUTTONS: { direction: ViewDirection; label: string }[] = [
  { direction: 'front', label: '正面' },
  { direction: 'back', label: '背面' },
  { direction: 'left', label: '左' },
  { direction: 'right', label: '右' },
  { direction: 'top', label: '上' },
]

export function ViewerControls({ onSetView, bonesVisible, onToggleBones, disabled }: ViewerControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/70 px-3 py-2">
      {VIEW_BUTTONS.map((btn) => (
        <button
          key={btn.direction}
          type="button"
          disabled={disabled}
          onClick={() => onSetView(btn.direction)}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {btn.label}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSetView('reset')}
        className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        リセット
      </button>
      <div className="mx-1 h-5 w-px bg-slate-700" />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggleBones(!bonesVisible)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          bonesVisible ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
        }`}
      >
        <Bone className="h-3.5 w-3.5" />
        ボーン表示
      </button>
    </div>
  )
}
