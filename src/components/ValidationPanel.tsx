import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { ValidationResult } from '../types/humanoid'

export function ValidationPanel({ result }: { result: ValidationResult }) {
  return (
    <div
      className={`space-y-2 rounded-lg border p-3 text-sm ${
        result.status === 'valid'
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : result.status === 'warning'
            ? 'border-amber-500/30 bg-amber-500/10'
            : 'border-red-500/30 bg-red-500/10'
      }`}
    >
      <div className="flex items-center gap-2 font-medium">
        {result.status === 'valid' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
        {result.status === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-400" />}
        {result.status === 'error' && <XCircle className="h-4 w-4 text-red-400" />}
        <span className={result.status === 'valid' ? 'text-emerald-200' : result.status === 'warning' ? 'text-amber-200' : 'text-red-200'}>
          {result.status === 'valid' && 'VRM化に必要なボーンが揃っています'}
          {result.status === 'warning' && '確認が必要な項目があります'}
          {result.status === 'error' && 'VRM化に必要なボーンが不足しています'}
        </span>
      </div>
      {result.issues.length > 0 && (
        <ul className="space-y-1 pl-6 text-xs text-slate-300">
          {result.issues.map((issue, i) => (
            <li key={i} className="list-disc">
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
