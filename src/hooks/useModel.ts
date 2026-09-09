import { useCallback, useRef, useState } from 'react'
import { HeuristicRiggingProvider } from '../three/AutoRigger'
import { disposeModel, loadModelFile, reanalyzeModel } from '../three/ModelLoader'
import type { LoadedModel } from '../types/model'

export interface UseModelResult {
  model: LoadedModel | null
  loading: boolean
  error: string | null
  loadFile: (file: File) => Promise<LoadedModel | null>
  reset: () => void
  autoRigging: boolean
  autoRigError: string | null
  /** Resolves to `null` on success, or the error message on failure. */
  runAutoRig: () => Promise<string | null>
}

/** Owns the currently loaded model and guarantees the previous one is disposed before it's replaced. */
export function useModel(): UseModelResult {
  const [model, setModel] = useState<LoadedModel | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRigging, setAutoRigging] = useState(false)
  const [autoRigError, setAutoRigError] = useState<string | null>(null)
  const currentSceneRef = useRef<LoadedModel['scene'] | null>(null)
  const modelRef = useRef<LoadedModel | null>(null)

  const loadFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const loaded = await loadModelFile(file)
      if (currentSceneRef.current) disposeModel(currentSceneRef.current)
      currentSceneRef.current = loaded.scene
      modelRef.current = loaded
      setModel(loaded)
      return loaded
    } catch (err) {
      console.error('[useModel] failed to load model', err)
      const message = err instanceof Error ? err.message : '3Dモデルの読み込みに失敗しました。'
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    if (currentSceneRef.current) disposeModel(currentSceneRef.current)
    currentSceneRef.current = null
    modelRef.current = null
    setModel(null)
    setError(null)
    setAutoRigError(null)
  }, [])

  const runAutoRig = useCallback(async (): Promise<string | null> => {
    const current = modelRef.current
    if (!current || current.hasBones) return 'モデルが読み込まれていません。'

    setAutoRigging(true)
    setAutoRigError(null)
    try {
      const provider = new HeuristicRiggingProvider()
      const skeleton = await provider.generateSkeleton(current.scene)
      await provider.skinMesh(current.scene, skeleton)
      const updated = reanalyzeModel(current)
      modelRef.current = updated
      setModel(updated)
      return null
    } catch (err) {
      console.error('[useModel] auto-rig failed', err)
      const message = err instanceof Error ? err.message : 'AI自動リギングに失敗しました。'
      setAutoRigError(message)
      return message
    } finally {
      setAutoRigging(false)
    }
  }, [])

  return { model, loading, error, loadFile, reset, autoRigging, autoRigError, runAutoRig }
}
