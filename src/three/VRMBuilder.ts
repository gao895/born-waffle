import type * as THREE from 'three'
import type { BoneCandidate, HumanoidMappingTable } from '../types/humanoid'
import type { MorphTargetInfo } from '../types/model'
import type { ExpressionMapping, SpringBoneChainConfig, VRMMetadata } from '../types/vrm'

export interface VrmMorphTargetBindData {
  mesh: THREE.Mesh
  index: number
  weight: number
}

export interface VrmExpressionData {
  preset: string
  morphTargetBinds: VrmMorphTargetBindData[]
}

export interface VrmSpringJointData {
  node: THREE.Object3D
  hitRadius: number
  stiffness: number
  gravityPower: number
  gravityDir: [number, number, number]
  dragForce: number
}

export interface VrmSpringData {
  name: string
  joints: VrmSpringJointData[]
}

/**
 * Intermediate, framework-agnostic representation of everything a VRM 1.0
 * file needs, still referencing live THREE.Object3D/Mesh instances rather
 * than glTF node indices (those only exist once GLTFExporter has written
 * the node list — see VRMExporter.ts).
 */
export interface VRMBuildResult {
  specVersion: '1.0'
  meta: Record<string, unknown>
  humanBoneNodes: Partial<Record<string, THREE.Object3D>>
  expressions: VrmExpressionData[]
  springs: VrmSpringData[]
}

export function buildVRMData(params: {
  humanoidMapping: HumanoidMappingTable
  metadata: VRMMetadata
  expressions: Record<string, ExpressionMapping>
  morphTargets: MorphTargetInfo[]
  springBoneChains: SpringBoneChainConfig[]
  allBones: BoneCandidate[]
}): VRMBuildResult {
  const { humanoidMapping, metadata, expressions, morphTargets, springBoneChains, allBones } = params

  const humanBoneNodes: Partial<Record<string, THREE.Object3D>> = {}
  for (const mapping of Object.values(humanoidMapping)) {
    if (mapping.node) humanBoneNodes[mapping.boneName] = mapping.node
  }

  const meta: Record<string, unknown> = {
    name: metadata.title || 'AI Auto VRM Avatar',
    version: metadata.version || undefined,
    authors: [metadata.author || 'Unknown'],
    licenseUrl: metadata.licenseUrl || 'https://vrm.dev/licenses/1.0/',
    avatarPermission: metadata.allowAvatarUsage,
    contactInformation: metadata.contactInformation || undefined,
    references: metadata.reference ? [metadata.reference] : undefined,
  }

  const morphByName = new Map<string, MorphTargetInfo>()
  for (const m of morphTargets) morphByName.set(m.name, m)

  const expressionData: VrmExpressionData[] = []
  for (const exp of Object.values(expressions)) {
    if (!exp.morphTargetName) continue
    const target = morphByName.get(exp.morphTargetName)
    if (!target) continue
    expressionData.push({
      preset: exp.preset,
      morphTargetBinds: [{ mesh: target.mesh, index: target.index, weight: 1 }],
    })
  }

  const boneNodeByName = new Map<string, THREE.Object3D>()
  for (const b of allBones) boneNodeByName.set(b.name, b.node)

  const springs: VrmSpringData[] = springBoneChains.map((chain) => ({
    name: chain.name,
    joints: chain.joints
      .map((j) => {
        const node = boneNodeByName.get(j.nodeName)
        if (!node) return null
        const joint: VrmSpringJointData = {
          node,
          hitRadius: j.hitRadius,
          stiffness: j.stiffness,
          gravityPower: j.gravityPower,
          gravityDir: [0, -1, 0],
          dragForce: j.dragForce,
        }
        return joint
      })
      .filter((j): j is VrmSpringJointData => j !== null),
  }))

  return {
    specVersion: '1.0',
    meta,
    humanBoneNodes,
    expressions: expressionData,
    springs: springs.filter((s) => s.joints.length > 0),
  }
}
