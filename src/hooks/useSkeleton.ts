import { useCallback, useEffect, useMemo, useState } from 'react'
import type * as THREE from 'three'
import { detectBones } from '../three/BoneDetector'
import { applyManualMapping, mapHumanoidBones } from '../three/HumanoidMapper'
import { judgeHumanoid, judgePose } from '../three/SkeletonAnalyzer'
import type { BoneCandidate, HumanoidMappingTable, VRMHumanBoneName } from '../types/humanoid'
import type { LoadedModel } from '../types/model'

export interface UseSkeletonResult {
  bones: BoneCandidate[]
  mapping: HumanoidMappingTable | null
  humanoidJudgement: ReturnType<typeof judgeHumanoid> | null
  pose: ReturnType<typeof judgePose> | null
  setManualMapping: (boneName: VRMHumanBoneName, node: THREE.Object3D | null) => void
  resetToAuto: () => void
}

export function useSkeleton(model: LoadedModel | null): UseSkeletonResult {
  const [mapping, setMapping] = useState<HumanoidMappingTable | null>(null)

  const bones = useMemo(() => {
    if (!model) return []
    return detectBones(model.scene, model.skeleton)
  }, [model])

  const autoMapping = useMemo(() => {
    if (!model || bones.length === 0) return null
    return mapHumanoidBones(bones, model.stats)
  }, [model, bones])

  useEffect(() => {
    setMapping(autoMapping)
  }, [autoMapping])

  const humanoidJudgement = useMemo(() => {
    if (!model) return null
    return judgeHumanoid(bones, model.stats)
  }, [model, bones])

  const pose = useMemo(() => {
    if (bones.length === 0) return null
    return judgePose(bones)
  }, [bones])

  const setManualMapping = useCallback((boneName: VRMHumanBoneName, node: THREE.Object3D | null) => {
    setMapping((prev) => (prev ? applyManualMapping(prev, boneName, node) : prev))
  }, [])

  const resetToAuto = useCallback(() => {
    setMapping(autoMapping)
  }, [autoMapping])

  return { bones, mapping, humanoidJudgement, pose, setManualMapping, resetToAuto }
}
