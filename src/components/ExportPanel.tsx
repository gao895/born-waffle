import { Download, Loader2, Sparkles } from 'lucide-react'
import type { VRMFormat } from '../hooks/useVRM'

interface ExportSummary {
  mappedRequiredCount: number
  totalRequiredCount: number
  expressionCount: number
  springChainCount: number
}

interface ExportPanelProps {
  canExport: boolean
  exporting: boolean
  exportReady: boolean
  summary: ExportSummary
  format: VRMFormat
  onFormatChange: (format: VRMFormat) => void
  onExport: () => void
  onDownload: () => void
}

export function ExportPanel({ canExport, exporting, exportReady, summary, format, onFormatChange, onExport, onDownload }: ExportPanelProps) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">書き出し前の確認</h3>
      <ul className="space-y-1 text-sm text-slate-300">
        <li>
          人型ボーン設定: {summary.mappedRequiredCount} / {summary.totalRequiredCount}
        </li>
        <li>表情設定: {summary.expressionCount} 個</li>
        <li>ゆれもの設定: {summary.springChainCount} 個</li>
      </ul>

      <div>
        <span className="mb-1 block text-xs text-slate-400">VRMバージョン</span>
        <div className="flex gap-1.5">
          {(['1.0', '0.x'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onFormatChange(v)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                format === v ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              VRM {v}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={!canExport || exporting}
        onClick={onExport}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-base font-semibold text-white shadow-lg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
        {exporting ? 'VRMを生成しています…' : 'VRMを作成'}
      </button>

      {exportReady && (
        <button
          type="button"
          onClick={onDownload}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20"
        >
          <Download className="h-4 w-4" />
          avatar.vrm をダウンロード
        </button>
      )}
    </div>
  )
}
