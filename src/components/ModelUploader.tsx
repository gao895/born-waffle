import { Loader2, Upload } from 'lucide-react'
import { type ChangeEvent, type DragEvent, useCallback, useRef, useState } from 'react'

interface ModelUploaderProps {
  loading: boolean
  onFileSelected: (file: File) => void
  compact?: boolean
}

export function ModelUploader({ loading, onFileSelected, compact }: ModelUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (file) onFileSelected(file)
    },
    [onFileSelected],
  )

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors ${
        dragging ? 'border-violet-400 bg-violet-500/10' : 'border-slate-600 bg-slate-800/40 hover:border-slate-500'
      } ${compact ? 'p-6' : 'p-16'}`}
    >
      <input ref={inputRef} type="file" accept=".glb,.gltf" className="hidden" onChange={onChange} />
      {loading ? (
        <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
      ) : (
        <Upload className="h-10 w-10 text-violet-400" />
      )}
      <div className="text-center">
        <p className="text-lg font-medium text-slate-100">
          {loading ? 'モデルを読み込んでいます…' : '3Dモデルをここにドラッグ＆ドロップ'}
        </p>
        {!compact && <p className="mt-1 text-sm text-slate-400">クリックしてファイルを選択（.glb / .gltf）</p>}
      </div>
    </div>
  )
}
