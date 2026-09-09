import type { VRM } from '@pixiv/three-vrm'
import { Sparkles } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { AutoRigPanel } from './components/AutoRigPanel'
import { ExportPanel } from './components/ExportPanel'
import { ExpressionPanel } from './components/ExpressionPanel'
import { HumanoidPanel } from './components/HumanoidPanel'
import { MetadataPanel } from './components/MetadataPanel'
import { ModelInfoPanel } from './components/ModelInfoPanel'
import { ModelUploader } from './components/ModelUploader'
import { ModelViewer } from './components/ModelViewer'
import { PolygonReductionPanel } from './components/PolygonReductionPanel'
import { ProgressBar } from './components/ProgressBar'
import { SpringBonePanel } from './components/SpringBonePanel'
import { ToastStack } from './components/Toast'
import { ValidationPanel } from './components/ValidationPanel'
import { ViewerControls } from './components/ViewerControls'
import { useModel } from './hooks/useModel'
import { useSkeleton } from './hooks/useSkeleton'
import { useViewer } from './hooks/useViewer'
import { useVRM } from './hooks/useVRM'
import { loadVRMPreview } from './three/VRMExporter'
import { VRMRequiredHumanBoneName } from './types/humanoid'
import type { PipelineStep, StepState, ToastMessage } from './types/mapping'
import { downloadBlob } from './utils/downloadBlob'

const STEP_LABELS: Record<PipelineStep, string> = {
  load: 'モデル読み込み',
  analyze: 'モデル解析',
  bones: 'ボーン設定',
  vrm: 'VRM設定',
  export: '書き出し',
}

let toastSeq = 0

function App() {
  const {
    model,
    loading,
    error,
    loadFile,
    reset,
    autoRigging,
    autoRigError,
    runAutoRig,
    reducingPolygons,
    reduceError,
    runPolygonReduction,
  } = useModel()
  const { bones, mapping, humanoidJudgement, pose, setManualMapping, resetToAuto } = useSkeleton(model)
  const {
    metadata,
    setMetadata,
    expressions,
    setExpressionMorphTarget,
    springChains,
    autoSpringBones,
    clearSpringBones,
    validation,
    exporting,
    exportError,
    exportVrmFile,
  } = useVRM(model, mapping, bones)
  const viewer = useViewer()

  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null)
  const [previewVrm, setPreviewVrm] = useState<VRM | null>(null)

  const pushToast = useCallback((kind: ToastMessage['kind'], text: string) => {
    const id = `toast-${++toastSeq}`
    setToasts((prev) => [...prev, { id, kind, text }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }, [])
  const dismissToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), [])

  const handleFileSelected = useCallback(
    async (file: File) => {
      setExportedBlob(null)
      setPreviewVrm(null)
      const loaded = await loadFile(file)
      if (!loaded) {
        pushToast('error', 'モデルの読み込みに失敗しました。')
        return
      }
      if (loaded.textureLoadWarning) {
        pushToast('warning', loaded.textureLoadWarning)
      } else if (!loaded.hasBones) {
        pushToast('warning', 'このモデルにはボーンがありません。AIで自動リギングできます。')
      } else {
        pushToast('success', 'モデルを解析しました。')
      }
    },
    [loadFile, pushToast],
  )

  const handleAutoRig = useCallback(async () => {
    const errorMessage = await runAutoRig()
    if (errorMessage) {
      pushToast('error', errorMessage)
    } else {
      pushToast('success', 'AI自動リギングが完了しました。ボーン設定を確認してください。')
    }
  }, [runAutoRig, pushToast])

  const handleReducePolygons = useCallback(
    async (targetTriangleCount: number) => {
      const errorMessage = await runPolygonReduction(targetTriangleCount)
      if (errorMessage) {
        pushToast('error', errorMessage)
      } else {
        pushToast('success', 'ポリゴン数を削減しました。')
      }
    },
    [runPolygonReduction, pushToast],
  )

  const handleReset = useCallback(() => {
    reset()
    setExportedBlob(null)
    setPreviewVrm(null)
    viewer.clearSelectedBone()
  }, [reset, viewer])

  const handleExport = useCallback(async () => {
    const blob = await exportVrmFile()
    if (!blob) {
      pushToast('error', exportError ?? 'VRMを生成できませんでした。')
      return
    }
    setExportedBlob(blob)
    try {
      const vrm = await loadVRMPreview(blob)
      setPreviewVrm(vrm)
      pushToast('success', 'VRMアバターが完成しました！')
    } catch (err) {
      console.error('[App] preview reload failed', err)
      pushToast('warning', 'VRMは生成されましたが、プレビューの再読み込みに失敗しました。')
    }
  }, [exportVrmFile, exportError, pushToast])

  const handleDownload = useCallback(() => {
    if (exportedBlob) downloadBlob(exportedBlob, 'avatar.vrm')
  }, [exportedBlob])

  const displayScene = previewVrm ? previewVrm.scene : (model?.scene ?? null)
  const displayBones = previewVrm ? [] : bones

  const steps: StepState[] = useMemo(() => {
    const state = (step: PipelineStep, status: StepState['status']): StepState => ({ step, label: STEP_LABELS[step], status })
    return [
      state('load', loading ? 'active' : model ? 'done' : 'pending'),
      state('analyze', model ? 'done' : 'pending'),
      state('bones', mapping ? 'done' : model ? 'active' : 'pending'),
      state('vrm', validation ? (validation.status === 'error' ? 'active' : 'done') : model ? 'pending' : 'pending'),
      state('export', exportedBlob ? 'done' : exporting ? 'active' : 'pending'),
    ]
  }, [loading, model, mapping, validation, exporting, exportedBlob])

  const requiredNames = useMemo(() => Object.values(VRMRequiredHumanBoneName), [])
  const mappedRequiredCount = useMemo(
    () => (mapping ? requiredNames.filter((n) => mapping[n]?.node).length : 0),
    [mapping, requiredNames],
  )
  const expressionCount = useMemo(() => Object.values(expressions).filter((e) => e.morphTargetName).length, [expressions])

  const busyLabel = loading
    ? 'モデルを解析しています…'
    : autoRigging
      ? 'AIがボーンを自動生成しています…'
      : reducingPolygons
        ? 'ポリゴン数を削減しています…'
        : exporting
          ? 'VRMを生成しています…'
          : null

  return (
    <div className="flex h-screen flex-col bg-[#0b0c10] text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-400" />
          <div>
            <h1 className="text-sm font-semibold leading-tight">AI Auto VRM Maker</h1>
            <p className="text-xs text-slate-400">3Dモデルをアップロードするだけ</p>
          </div>
        </div>
        {model && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
          >
            別のモデルを読み込む
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="order-2 w-full shrink-0 border-b border-slate-800 p-3 lg:order-none lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          {model ? (
            <ModelInfoPanel model={model} judgement={humanoidJudgement} pose={pose} />
          ) : (
            <p className="text-sm text-slate-500">モデルを読み込むと情報がここに表示されます。</p>
          )}
        </aside>

        <main className="order-1 flex min-w-0 flex-1 flex-col lg:order-none">
          {model ? (
            <>
              <ViewerControls
                onSetView={viewer.setView}
                bonesVisible={viewer.bonesVisible}
                onToggleBones={viewer.setBonesVisible}
                disabled={!!previewVrm}
              />
              <div className="h-[50vh] min-h-[320px] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
                <ModelViewer
                  ref={viewer.viewerRef}
                  scene={displayScene}
                  bones={displayBones}
                  bonesVisible={viewer.bonesVisible}
                  selectedBoneNode={viewer.selectedBoneNode}
                  onBoneClick={viewer.handleBoneClick}
                />
              </div>
              {viewer.selectedBone && (
                <div className="border-t border-slate-800 bg-slate-900/80 px-4 py-2 text-xs text-slate-300">
                  選択中のボーン: <span className="font-medium text-slate-100">{viewer.selectedBone.name}</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="w-full max-w-xl">
                <ModelUploader loading={loading} onFileSelected={handleFileSelected} />
                {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
              </div>
            </div>
          )}
        </main>

        {model && (
          <aside className="order-3 w-full shrink-0 space-y-4 border-t border-slate-800 p-3 lg:order-none lg:w-80 lg:overflow-y-auto lg:border-t-0 lg:border-l">
            <PolygonReductionPanel
              triangleCount={model.stats.triangleCount}
              reducing={reducingPolygons}
              reduceError={reduceError}
              onReduce={handleReducePolygons}
            />
            {!model.hasBones ? (
              <AutoRigPanel autoRigging={autoRigging} autoRigError={autoRigError} onRunAutoRig={handleAutoRig} />
            ) : (
              <>
                {mapping && (
                  <HumanoidPanel
                    mapping={mapping}
                    bones={bones}
                    onChange={setManualMapping}
                    onReset={resetToAuto}
                    onHoverBone={viewer.setHoveredBoneNode}
                  />
                )}
                {validation && <ValidationPanel result={validation} />}
                <MetadataPanel metadata={metadata} onChange={setMetadata} />
                <ExpressionPanel expressions={expressions} morphTargets={model.morphTargets} onChange={setExpressionMorphTarget} />
                <SpringBonePanel chains={springChains} onAutoDetect={autoSpringBones} onClear={clearSpringBones} disabled={bones.length === 0} />
                <ExportPanel
                  canExport={!!validation && validation.status !== 'error' && !exporting}
                  exporting={exporting}
                  exportReady={!!exportedBlob}
                  summary={{
                    mappedRequiredCount,
                    totalRequiredCount: requiredNames.length,
                    expressionCount,
                    springChainCount: springChains.length,
                  }}
                  onExport={handleExport}
                  onDownload={handleDownload}
                />
              </>
            )}
          </aside>
        )}
      </div>

      <ProgressBar steps={steps} busyLabel={busyLabel} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

export default App
