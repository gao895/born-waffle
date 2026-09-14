import { useCallback, useEffect, useMemo, useState } from 'react'
import { autoDetectSpringBoneChains } from '../three/SpringBoneManager'
import { mapExpressions } from '../three/MorphTargetAnalyzer'
import { buildVRMData } from '../three/VRMBuilder'
import { exportVRM } from '../three/VRMExporter'
import { buildVRM0Data } from '../three/VRMBuilder0'
import { exportVRM0 } from '../three/VRMExporter0'
import { validateHumanoidMapping } from '../three/VRMValidator'
import type { BoneCandidate, HumanoidMappingTable } from '../types/humanoid'
import type { LoadedModel } from '../types/model'
import { DEFAULT_VRM_METADATA } from '../types/vrm'
import type { ExpressionMapping, SpringBoneChainConfig, VRMMetadata } from '../types/vrm'

export type VRMFormat = '1.0' | '0.x'

export function useVRM(model: LoadedModel | null, mapping: HumanoidMappingTable | null, bones: BoneCandidate[]) {
  const [metadata, setMetadata] = useState<VRMMetadata>(DEFAULT_VRM_METADATA)
  const [expressions, setExpressions] = useState<Record<string, ExpressionMapping>>({})
  const [springChains, setSpringChains] = useState<SpringBoneChainConfig[]>([])
  const [format, setFormat] = useState<VRMFormat>('1.0')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // Auto-rigging and polygon reduction mutate the same scene in place and return a new
  // `model` object wrapping it (see reanalyzeModel), so `model` itself is a new reference
  // every time - keying this reset on `model` would wipe out metadata/expressions/spring
  // bones the user just configured the moment they, say, reduce the polygon count
  // afterward. `model.scene` is the one thing that's the same instance across those
  // in-place updates and only actually changes when a genuinely different file is loaded.
  useEffect(() => {
    setMetadata(DEFAULT_VRM_METADATA)
    setSpringChains([])
    setExpressions(model ? mapExpressions(model.morphTargets) : {})
  }, [model?.scene])

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
      if (format === '0.x') {
        const data = buildVRM0Data({
          humanoidMapping: mapping,
          metadata,
          expressions,
          morphTargets: model.morphTargets,
          springBoneChains: springChains,
          allBones: bones,
        })
        return await exportVRM0(model.scene, data)
      }
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
  }, [model, mapping, metadata, expressions, springChains, bones, format])

  return {
    metadata,
    setMetadata,
    expressions,
    setExpressionMorphTarget,
    springChains,
    autoSpringBones,
    clearSpringBones,
    format,
    setFormat,
    validation,
    exporting,
    exportError,
    exportVrmFile,
  }
}
