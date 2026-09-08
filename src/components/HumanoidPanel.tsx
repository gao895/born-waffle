import { CheckCircle2, RotateCcw } from 'lucide-react'
import { useMemo } from 'react'
import type * as THREE from 'three'
import { VRMHumanBoneList, VRMRequiredHumanBoneName } from '../types/humanoid'
import type { BoneCandidate, HumanoidMappingTable, VRMHumanBoneName } from '../types/humanoid'
import { boneLabel } from '../utils/boneLabels'

interface HumanoidPanelProps {
  mapping: HumanoidMappingTable
  bones: BoneCandidate[]
  onChange: (boneName: VRMHumanBoneName, node: THREE.Object3D | null) => void
  onReset: () => void
  onHoverBone: (node: THREE.Object3D | null) => void
}

const REQUIRED_SET = new Set<string>(Object.values(VRMRequiredHumanBoneName))

function confidenceColor(confidence: number, source: string): string {
  if (source === 'manual') return 'text-sky-400'
  if (confidence >= 80) return 'text-emerald-400'
  if (confidence >= 50) return 'text-amber-400'
  if (confidence > 0) return 'text-orange-400'
  return 'text-slate-500'
}

function BoneRow({
  boneName,
  mapping,
  bones,
  onChange,
  onHoverBone,
}: {
  boneName: VRMHumanBoneName
  mapping: HumanoidMappingTable[VRMHumanBoneName]
  bones: BoneCandidate[]
  onChange: HumanoidPanelProps['onChange']
  onHoverBone: HumanoidPanelProps['onHoverBone']
}) {
  const options = useMemo(() => {
    const list = mapping.node ? [mapping.node, ...mapping.alternatives.map((a) => a.node)] : mapping.alternatives.map((a) => a.node)
    const seen = new Set<THREE.Object3D>()
    const unique = list.filter((n) => {
      if (seen.has(n)) return false
      seen.add(n)
      return true
    })
    return unique
  }, [mapping])

  const currentName = mapping.node?.name ?? ''

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-800/60"
      onMouseEnter={() => onHoverBone(mapping.node)}
      onMouseLeave={() => onHoverBone(null)}
    >
      <span className="w-28 shrink-0 text-sm text-slate-300">
        {boneLabel(boneName)}
        {REQUIRED_SET.has(boneName) && <span className="ml-1 text-red-400">*</span>}
      </span>
      <select
        value={currentName}
        onChange={(e) => {
          const node = bones.find((b) => b.name === e.target.value)?.node ?? null
          onChange(boneName, node)
        }}
        className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
      >
        <option value="">未割り当て</option>
        {options.map((node) => (
          <option key={node.uuid} value={node.name}>
            {node.name}
          </option>
        ))}
      </select>
      <span className={`w-16 shrink-0 text-right text-xs font-medium ${confidenceColor(mapping.confidence, mapping.source)}`}>
        {mapping.source === 'manual' ? '手動' : mapping.node ? `${mapping.confidence}%` : '-'}
      </span>
      {mapping.node && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
    </div>
  )
}

export function HumanoidPanel({ mapping, bones, onChange, onReset, onHoverBone }: HumanoidPanelProps) {
  const requiredBones = VRMHumanBoneList.filter((n) => REQUIRED_SET.has(n))
  const otherBones = VRMHumanBoneList.filter((n) => !REQUIRED_SET.has(n))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">人型ボーン設定</h3>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
        >
          <RotateCcw className="h-3 w-3" />
          自動設定に戻す
        </button>
      </div>

      <div className="space-y-0.5">
        {requiredBones.map((boneName) => (
          <BoneRow
            key={boneName}
            boneName={boneName}
            mapping={mapping[boneName]}
            bones={bones}
            onChange={onChange}
            onHoverBone={onHoverBone}
          />
        ))}
      </div>

      <details className="rounded-lg border border-slate-800">
        <summary className="cursor-pointer select-none px-2 py-1.5 text-xs text-slate-400">
          詳細設定（指・目・肩など）
        </summary>
        <div className="space-y-0.5 p-1">
          {otherBones.map((boneName) => (
            <BoneRow
              key={boneName}
              boneName={boneName}
              mapping={mapping[boneName]}
              bones={bones}
              onChange={onChange}
              onHoverBone={onHoverBone}
            />
          ))}
        </div>
      </details>
    </div>
  )
}
