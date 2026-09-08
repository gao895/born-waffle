import { useCallback, useRef, useState } from 'react'
import { disposeModel, loadModelFile } from '../three/ModelLoader'
import type { LoadedModel } from '../types/model'

export interface UseModelResult {
  model: LoadedModel | null
  loading: boolean
  error: string | null
  loadFile: (file: File) => Promise<LoadedModel | null>
  reset: () => void
}

/** Owns the currently loaded model and guarantees the previous one is disposed before it's replaced. */
export function useModel(): UseModelResult {
  const [model, setModel] = useState<LoadedModel | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentSceneRef = useRef<LoadedModel['scene'] | null>(null)

  const loadFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const loaded = await loadModelFile(file)
      if (currentSceneRef.current) disposeModel(currentSceneRef.current)
      currentSceneRef.current = loaded.scene
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
    setModel(null)
    setError(null)
  }, [])

  return { model, loading, error, loadFile, reset }
}
