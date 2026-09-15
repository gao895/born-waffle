import * as THREE from 'three'
import type { BoneCandidate, HumanoidMappingTable } from '../types/humanoid'
import type { SpringBoneChainConfig } from '../types/vrm'

const DEFAULT_JOINT_PARAMS = {
  hitRadius: 0.02,
  stiffness: 0.6,
  gravityPower: 0.05,
  dragForce: 0.4,
}

/**
 * Heuristic "Auto SpringBone" pass: any bone chain that hangs off a mapped
 * Humanoid bone (head, chest, hips, ...) but is itself NOT part of the
 * Humanoid skeleton is treated as a dangling accessory - hair, a skirt,
 * a tail, an accessory - and turned into a spring chain. This is a
 * heuristic, not true physics/AI classification; see section 23 of the spec.
 */
export function autoDetectSpringBoneChains(
  allBones: BoneCandidate[],
  mapping: HumanoidMappingTable,
): SpringBoneChainConfig[] {
  const mappedNodes = new Set<THREE.Object3D>()
  for (const m of Object.values(mapping)) {
    if (m.node) mappedNodes.add(m.node)
  }

  const byNode = new Map<THREE.Object3D, BoneCandidate>()
  for (const b of allBones) byNode.set(b.node, b)

  const chainRoots = allBones.filter((b) => {
    if (mappedNodes.has(b.node)) return false
    if (!b.parent) return false
    return mappedNodes.has(b.parent)
  })

  const chains: SpringBoneChainConfig[] = []

  chainRoots.forEach((root, chainIndex) => {
    const joints: BoneCandidate[] = []
    let current: BoneCandidate | undefined = root

    while (current && !mappedNodes.has(current.node)) {
      joints.push(current)
      const boneChildren = current.node.children.filter((c) => (c as THREE.Bone).isBone)
      if (boneChildren.length !== 1) break
      current = byNode.get(boneChildren[0])
    }

    if (joints.length === 0) return

    chains.push({
      id: `spring-${chainIndex}-${root.name}`,
      name: root.name || `SpringChain${chainIndex + 1}`,
      rootBoneName: root.name,
      joints: joints.map((j) => ({
        nodeName: j.name,
        ...DEFAULT_JOINT_PARAMS,
      })),
      colliderGroupIndices: [],
    })
  })

  return chains
}
