import { Wind } from 'lucide-react'
import type { SpringBoneChainConfig } from '../types/vrm'

interface SpringBonePanelProps {
  chains: SpringBoneChainConfig[]
  onAutoDetect: () => void
  onClear: () => void
  disabled: boolean
}

export function SpringBonePanel({ chains, onAutoDetect, onClear, disabled }: SpringBonePanelProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">ゆれもの設定 (SpringBone)</h3>
      <p className="text-xs text-slate-500">髪・スカート・しっぽなど、人型ボーンに含まれない揺れる部分を自動検出します。</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onAutoDetect}
          className="flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Wind className="h-3.5 w-3.5" />
          SpringBoneを自動設定
        </button>
        {chains.length > 0 && (
          <button type="button" onClick={onClear} className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">
            クリア
          </button>
        )}
      </div>
      {chains.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-300">
          {chains.map((chain) => (
            <li key={chain.id} className="rounded-md bg-slate-800/60 px-2 py-1.5">
              {chain.name}
              <span className="ml-2 text-xs text-slate-500">{chain.joints.length} ジョイント</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
