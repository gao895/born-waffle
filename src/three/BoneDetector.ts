import * as THREE from 'three'
import type { BoneCandidate } from '../types/humanoid'
import { detectSideFromName, detectSideFromPosition, getWorldX } from '../utils/detectSide'
import { normalizeBoneName } from '../utils/normalizeBoneName'

/**
 * Walks the model's skeleton (or, if no SkinnedMesh is present, the raw
 * Object3D hierarchy) and produces a flat, analyzable list of bone
 * candidates: normalized name, detected side, hierarchy depth and parent.
 */
export function detectBones(scene: THREE.Object3D, skeleton: THREE.Skeleton | null): BoneCandidate[] {
  const bones: THREE.Bone[] = skeleton ? skeleton.bones : collectBonesFromScene(scene)
  if (bones.length === 0) return []

  const boneSet = new Set<THREE.Object3D>(bones)
  const box = new THREE.Box3()
  for (const bone of bones) box.expandByPoint(new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld))
  const centerX = box.isEmpty() ? 0 : (box.min.x + box.max.x) / 2

  const depthCache = new Map<THREE.Object3D, number>()
  const depthOf = (bone: THREE.Object3D): number => {
    if (depthCache.has(bone)) return depthCache.get(bone) as number
    let depth = 0
    let cursor: THREE.Object3D | null = bone.parent
    while (cursor) {
      if (boneSet.has(cursor)) depth++
      cursor = cursor.parent
    }
    depthCache.set(bone, depth)
    return depth
  }

  return bones.map((bone) => {
    const nameSide = detectSideFromName(bone.name)
    const side = nameSide !== 'unknown' ? nameSide : detectSideFromPosition(getWorldX(bone), centerX)
    const parent = bone.parent && boneSet.has(bone.parent) ? bone.parent : null

    const candidate: BoneCandidate = {
      node: bone,
      name: bone.name || '(unnamed)',
      normalized: normalizeBoneName(bone.name || ''),
      side,
      depth: depthOf(bone),
      parent,
    }
    return candidate
  })
}

function collectBonesFromScene(scene: THREE.Object3D): THREE.Bone[] {
  const bones: THREE.Bone[] = []
  scene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) bones.push(obj as THREE.Bone)
  })
  return bones
}
