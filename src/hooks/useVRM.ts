import { useCallback, useEffect, useMemo, useState } from 'react'
import { autoDetectSpringBoneChains } from '../three/SpringBoneManager'
import { mapExpressions } from '../three/MorphTargetAnalyzer'
import { buildVRMData } from '../three/VRMBuilder'
import { exportVRM } from '../three/VRMExporter'
import { validateHumanoidMapping } from '../three/VRMValidator'
import type { BoneCandidate, HumanoidMappingTable } from '../types/humanoid'
import type { LoadedModel } from '../types/model'
import { DEFAULT_VRM_METADATA } from '../types/vrm'
import type { ExpressionMapping, SpringBoneChainConfig, VRMMetadata } from '../types/vrm'

export function useVRM(model: LoadedModel | null, mapping: HumanoidMappingTable | null, bones: BoneCandidate[]) {
  const [metadata, setMetadata] = useState<VRMMetadata>(DEFAULT_VRM_METADATA)
  const [expressions, setExpressions] = useState<Record<string, ExpressionMapping>>({})
  const [springChains, setSpringChains] = useState<SpringBoneChainConfig[]>([])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    setMetadata(DEFAULT_VRM_METADATA)
    setSpringChains([])
    setExpressions(model ? mapExpressions(model.morphTargets) : {})
  }, [model])

  const setExpressionMorphTarget = useCallback((preset: string, morphTargetName: string | null) => {
    setExpressions((prev) => ({
      ...prev,
      [preset]: {
        preset,
        morphTargetName,
        meshNames: [],
        confidence: morphTargetName ? 100 : 0,
        source: morphTargetName ? 'manual' : 'unmapped',
      },
    }))
  }, [])

  const autoSpringBones = useCallback(() => {
    if (!mapping || bones.length === 0) return
    setSpringChains(autoDetectSpringBoneChains(bones, mapping))
  }, [mapping, bones])

  const clearSpringBones = useCallback(() => setSpringChains([]), [])

  const validation = useMemo(() => (mapping ? validateHumanoidMapping(mapping) : null), [mapping])

  const exportVrmFile = useCallback(async (): Promise<Blob | null> => {
    if (!model || !mapping) return null
    setExporting(true)
    setExportError(null)
    try {
      const data = buildVRMData({
        humanoidMapping: mapping,
        metadata,
        expressions,
        morphTargets: model.morphTargets,
        springBoneChains: springChains,
        allBones: bones,
      })
      return await exportVRM(model.scene, data)
    } catch (err) {
      console.error('[useVRM] export failed', err)
      setExportError(err instanceof Error ? err.message : 'VRMを生成できませんでした。')
      return null
    } finally {
      setExporting(false)
    }
  }, [model, mapping, metadata, expressions, springChains, bones])

  return {
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
  }
}
