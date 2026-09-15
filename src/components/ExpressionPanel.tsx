import type { MorphTargetInfo } from '../types/model'
import type { ExpressionMapping } from '../types/vrm'
import { VRMExpressionPresetName } from '../types/vrm'

interface ExpressionPanelProps {
  expressions: Record<string, ExpressionMapping>
  morphTargets: MorphTargetInfo[]
  onChange: (preset: string, morphTargetName: string | null) => void
}

const PRIMARY_PRESETS: string[] = [
  VRMExpressionPresetName.Happy,
  VRMExpressionPresetName.Angry,
  VRMExpressionPresetName.Sad,
  VRMExpressionPresetName.Surprised,
  VRMExpressionPresetName.Relaxed,
  VRMExpressionPresetName.Blink,
  VRMExpressionPresetName.BlinkLeft,
  VRMExpressionPresetName.BlinkRight,
]

const PRESET_LABEL_JA: Partial<Record<string, string>> = {
  happy: 'うれしい',
  angry: 'おこる',
  sad: 'かなしい',
  surprised: 'おどろく',
  relaxed: 'リラックス',
  blink: 'まばたき',
  blinkLeft: 'まばたき（左）',
  blinkRight: 'まばたき（右）',
}

function ExpressionRow({
  preset,
  mapping,
  morphTargets,
  onChange,
}: {
  preset: string
  mapping: ExpressionMapping | undefined
  morphTargets: MorphTargetInfo[]
  onChange: ExpressionPanelProps['onChange']
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-800/60">
      <span className="w-28 shrink-0 text-sm text-slate-300">{PRESET_LABEL_JA[preset] ?? preset}</span>
      <select
        value={mapping?.morphTargetName ?? ''}
        onChange={(e) => onChange(preset, e.target.value || null)}
        className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
      >
        <option value="">未割り当て</option>
        {morphTargets.map((m) => (
          <option key={`${m.meshName}-${m.name}`} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>
      <span className="w-12 shrink-0 text-right text-xs text-slate-400">
        {mapping?.morphTargetName ? `${mapping.confidence}%` : '-'}
      </span>
    </div>
  )
}

export function ExpressionPanel({ expressions, morphTargets, onChange }: ExpressionPanelProps) {
  if (morphTargets.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-400">
        このモデルにはモーフターゲット（表情）が見つかりませんでした。
      </div>
    )
  }

  const otherPresets = Object.values(VRMExpressionPresetName).filter((p) => !PRIMARY_PRESETS.includes(p))

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">表情 (Expressions)</h3>
      <div className="space-y-0.5">
        {PRIMARY_PRESETS.map((preset) => (
          <ExpressionRow key={preset} preset={preset} mapping={expressions[preset]} morphTargets={morphTargets} onChange={onChange} />
        ))}
      </div>
      <details className="rounded-lg border border-slate-800">
        <summary className="cursor-pointer select-none px-2 py-1.5 text-xs text-slate-400">詳細設定（口の形・視線など）</summary>
        <div className="space-y-0.5 p-1">
          {otherPresets.map((preset) => (
            <ExpressionRow key={preset} preset={preset} mapping={expressions[preset]} morphTargets={morphTargets} onChange={onChange} />
          ))}
        </div>
      </details>
    </div>
  )
}
