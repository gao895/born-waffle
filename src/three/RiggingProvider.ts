import type * as THREE from 'three'
import type { HumanoidMappingTable } from '../types/humanoid'

/**
 * Abstraction point for V2/V3 automatic rigging (bone-less models): a
 * pose-estimation-driven skeleton generator, an external auto-rigging
 * API, or an in-house model. Not implemented in V1 - see roadmap section
 * 40-42 of the design spec. V1 only ships `hasNoBoneSupport`, which the UI
 * uses to show the "AI auto-rigging coming soon" placeholder instead of
 * failing outright when a model has no skeleton.
 */
export interface RiggingProvider {
  readonly name: string
  detectSkeleton(scene: THREE.Object3D): Promise<THREE.Skeleton | null>
  generateSkeleton(scene: THREE.Object3D): Promise<THREE.Skeleton>
  skinMesh(scene: THREE.Object3D, skeleton: THREE.Skeleton): Promise<void>
  mapHumanoid(scene: THREE.Object3D, skeleton: THREE.Skeleton): Promise<HumanoidMappingTable>
}

export const NOT_YET_IMPLEMENTED_PROVIDER: RiggingProvider = {
  name: 'ai-auto-rigging-v2-placeholder',
  async detectSkeleton() {
    return null
  },
  async generateSkeleton() {
    throw new Error('AI自動リギングは現在準備中です。')
  },
  async skinMesh() {
    throw new Error('AI自動リギングは現在準備中です。')
  },
  async mapHumanoid() {
    throw new Error('AI自動リギングは現在準備中です。')
  },
}
