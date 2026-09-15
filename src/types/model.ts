import type * as THREE from 'three'

export interface MorphTargetInfo {
  meshName: string
  mesh: THREE.Mesh
  /** Index of the morph target inside mesh.morphTargetDictionary. */
  index: number
  name: string
  normalized: string
}

export interface ModelStats {
  meshCount: number
  vertexCount: number
  triangleCount: number
  materialCount: number
  textureCount: number
  boneCount: number
  skeletonCount: number
  animationCount: number
  boundingBox: { min: [number, number, number]; max: [number, number, number] }
  boundingSphereRadius: number
}

export interface LoadedModel {
  fileName: string
  fileSize: number
  scene: THREE.Group
  stats: ModelStats
  skeleton: THREE.Skeleton | null
  morphTargets: MorphTargetInfo[]
  animations: THREE.AnimationClip[]
  hasBones: boolean
  /** Set when the source file declared embedded textures but none ended up attached to any material. */
  textureLoadWarning: string | null
  /** Full step-by-step trace from the pre-load image shrink pass, for on-device diagnostics. */
  textureDiagnosticsLog: string[]
}
