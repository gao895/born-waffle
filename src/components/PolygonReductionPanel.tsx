import { AlertTriangle, Loader2, Scissors } from 'lucide-react'
import { useState } from 'react'

interface PolygonReductionPanelProps {
  triangleCount: number
  reducing: boolean
  reduceError: string | null
  onReduce: (targetTriangleCount: number) => void
}

const PRESETS = [
  { label: 'cluster (72,000)', value: 72000 },
  { label: 'VRChat Excellent (32,000)', value: 32000 },
]

export function PolygonReductionPanel({ triangleCount, reducing, reduceError, onReduce }: PolygonReductionPanelProps) {
  const [target, setTarget] = useState(72000)

  const alreadyUnderTarget = triangleCount <= target

  return (
    <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">
      <div>
        <p className="font-medium">ポリゴン数の削減</p>
        <p className="mt-1 text-xs text-slate-400">
          現在の三角ポリゴン数: <span className="font-mono text-slate-200">{triangleCount.toLocaleString()}</span>
          {' '}（VRChat・cluster等のメタバースプラットフォームには上限があります）
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => setTarget(preset.value)}
            className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
              target === preset.value
                ? 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <label className="block text-xs text-slate-400">
        目標ポリゴン数
        <input
          type="number"
          min={4}
          step={1000}
          value={target}
          onChange={(e) => setTarget(Math.max(4, Number(e.target.value) || 0))}
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-violet-500 focus:outline-none"
        />
      </label>

      <button
        type="button"
        disabled={reducing || alreadyUnderTarget}
        onClick={() => onReduce(target)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {reducing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
        {reducing ? 'ポリゴンを削減しています…' : alreadyUnderTarget ? 'すでに目標以下です' : 'ポリゴン数を削減する'}
      </button>

      {reduceError && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{reduceError}</p>
        </div>
      )}
    </div>
  )
}
