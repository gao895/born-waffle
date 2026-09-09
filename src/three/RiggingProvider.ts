import type * as THREE from 'three'
import type { HumanoidMappingTable } from '../types/humanoid'

/**
 * Abstraction point for automatic rigging of bone-less models (section
 * 40-42 of the design spec). `HeuristicRiggingProvider` (AutoRigger.ts) is
 * the current V2 implementation - a geometric silhouette heuristic, not a
 * real pose-estimation model. This interface exists so a future provider
 * (MediaPipe-driven pose estimation, an external auto-rigging API, an
 * in-house model) can replace it without touching the UI or the rest of
 * the pipeline: whatever implements this only has to produce a skeleton
 * named with the same VRM Humanoid bone names, and BoneDetector/
 * HumanoidMapper take it from there.
 */
export interface RiggingProvider {
  readonly name: string
  detectSkeleton(scene: THREE.Object3D): Promise<THREE.Skeleton | null>
  generateSkeleton(scene: THREE.Object3D): Promise<THREE.Skeleton>
  skinMesh(scene: THREE.Object3D, skeleton: THREE.Skeleton): Promise<void>
  mapHumanoid(scene: THREE.Object3D, skeleton: THREE.Skeleton): Promise<HumanoidMappingTable>
}
