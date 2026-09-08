import { VRMHumanBoneList, VRMHumanBoneName, VRMHumanBoneParentMap, VRMRequiredHumanBoneName } from '@pixiv/three-vrm'
import type * as THREE from 'three'

export type { VRMHumanBoneName }
export { VRMHumanBoneList, VRMHumanBoneParentMap, VRMRequiredHumanBoneName }

/** Confidence source for a bone mapping suggestion. */
export type MappingSource = 'exact' | 'normalized' | 'scored' | 'manual' | 'unmapped'

export interface BoneCandidate {
  /** The Object3D bone node in the loaded model's skeleton. */
  node: THREE.Object3D
  /** Original bone name as authored in the model. */
  name: string
  /** Normalized identifier used for matching. */
  normalized: string
  /** left / right / center / unknown, from name or position. */
  side: 'left' | 'right' | 'center' | 'unknown'
  /** Depth in the skeleton hierarchy (root = 0). */
  depth: number
  /** Parent bone node, if any. */
  parent: THREE.Object3D | null
}

export interface HumanoidMapping {
  /** VRM human bone name -> matched skeleton node (or null if unmapped). */
  boneName: VRMHumanBoneName
  node: THREE.Object3D | null
  /** 0-100 confidence score. */
  confidence: number
  source: MappingSource
  /** Other candidates considered, best first, for the manual dropdown. */
  alternatives: BoneCandidate[]
}

export type HumanoidMappingTable = Record<VRMHumanBoneName, HumanoidMapping>

export interface ValidationIssue {
  level: 'error' | 'warning'
  boneName?: VRMHumanBoneName
  message: string
}

export interface ValidationResult {
  status: 'valid' | 'warning' | 'error'
  issues: ValidationIssue[]
}

export type PoseGuess = 't-pose' | 'a-pose' | 'other'

export type HumanoidJudgement = 'humanoid' | 'non-humanoid' | 'unknown'
