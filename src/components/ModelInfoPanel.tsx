import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'
import type { HumanoidJudgementResult } from '../three/SkeletonAnalyzer'
import type { PoseGuess } from '../types/humanoid'
import type { LoadedModel } from '../types/model'

interface ModelInfoPanelProps {
  model: LoadedModel
  judgement: HumanoidJudgementResult | null
  pose: PoseGuess | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const POSE_LABEL: Record<PoseGuess, string> = {
  't-pose': 'Tポーズ',
  'a-pose': 'Aポーズ',
  other: 'その他',
}

export function ModelInfoPanel({ model, judgement, pose }: ModelInfoPanelProps) {
  const rows: [string, string | number][] = [
    ['File', model.fileName],
    ['Size', formatBytes(model.fileSize)],
    ['Meshes', model.stats.meshCount],
    ['Materials', model.stats.materialCount],
    ['Textures', model.stats.textureCount],
    ['Vertices', model.stats.vertexCount.toLocaleString()],
    ['Triangles', model.stats.triangleCount.toLocaleString()],
    ['Bones', model.stats.boneCount],
    ['Animations', model.stats.animationCount],
  ]

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">モデル情報</h3>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-slate-400">{label}</dt>
              <dd className="truncate text-right text-slate-100" title={String(value)}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {judgement && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
            judgement.judgement === 'humanoid'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : judgement.judgement === 'non-humanoid'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'border-slate-600 bg-slate-800/60 text-slate-300'
          }`}
        >
          {judgement.judgement === 'humanoid' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : judgement.judgement === 'non-humanoid' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <p className="font-medium">
              {judgement.judgement === 'humanoid'
                ? '人体モデルとして認識しました'
                : judgement.judgement === 'non-humanoid'
                  ? '人体モデルとして認識できませんでした'
                  : '人体モデルかどうか判定できませんでした'}
            </p>
            <p className="mt-0.5 text-xs opacity-80">判定スコア: {judgement.score}%</p>
          </div>
        </div>
      )}

      {pose && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-sm text-slate-200">
          姿勢: <span className="font-medium">{POSE_LABEL[pose]}</span>として認識しました
        </div>
      )}

      {model.textureLoadWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{model.textureLoadWarning}</p>
        </div>
      )}

      {model.textureDiagnosticsLog.length > 0 && (
        <details className="rounded-lg border border-slate-800">
          <summary className="cursor-pointer select-none px-2 py-1.5 text-xs text-slate-400">
            テクスチャ処理ログ（サポート用）
          </summary>
          <ul className="space-y-1 p-2 text-xs text-slate-400">
            {model.textureDiagnosticsLog.map((line, i) => (
              <li key={i} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
