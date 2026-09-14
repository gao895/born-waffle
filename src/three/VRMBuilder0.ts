import type * as THREE from 'three'
import type { BoneCandidate, HumanoidMappingTable } from '../types/humanoid'
import type { MorphTargetInfo } from '../types/model'
import type { ExpressionMapping, SpringBoneChainConfig, VRMMetadata } from '../types/vrm'

export interface Vrm0MorphTargetBindData {
  mesh: THREE.Mesh
  index: number
  weight: number
}

export interface Vrm0ExpressionData {
  /** VRM0 BlendShapePresetName ('unknown' for anything with no VRM0 equivalent). */
  presetName: string
  /** Human-readable group name - required when presetName is 'unknown' so viewers have something to label it with. */
  name: string
  morphTargetBinds: Vrm0MorphTargetBindData[]
}

export interface Vrm0SpringData {
  name: string
  stiffness: number
  gravityPower: number
  dragForce: number
  hitRadius: number
  /** VRM0 only needs the root of each chain - the runtime walks its bone children automatically. */
  rootNode: THREE.Object3D
}

/**
 * Intermediate, framework-agnostic representation of everything a VRM 0.x
 * file needs, mirroring VRMBuilder.ts's role for VRM 1.0 - still referencing
 * live THREE.Object3D/Mesh instances rather than glTF node indices (those
 * only exist once GLTFExporter has written the node list, see
 * VRMExporter0.ts).
 */
export interface VRM0BuildResult {
  meta: Record<string, unknown>
  humanBoneNodes: Partial<Record<string, THREE.Object3D>>
  headNode: THREE.Object3D | null
  expressions: Vrm0ExpressionData[]
  springs: Vrm0SpringData[]
}

// VRM1's expression presets (aa/ih/ou/ee/oh/happy/angry/sad/relaxed/surprised/...) don't line
// up 1:1 with VRM0's BlendShapePresetName - map what has a direct VRM0 equivalent, and fall back
// to a named custom ('unknown') group for the rest so the expression is still exported instead of
// silently dropped.
const VRM1_TO_VRM0_PRESET: Record<string, string> = {
  aa: 'a',
  ih: 'i',
  ou: 'u',
  ee: 'e',
  oh: 'o',
  blink: 'blink',
  blinkLeft: 'blink_l',
  blinkRight: 'blink_r',
  happy: 'joy',
  angry: 'angry',
  sad: 'sorrow',
  relaxed: 'fun',
  lookUp: 'lookup',
  lookDown: 'lookdown',
  lookLeft: 'lookleft',
  lookRight: 'lookright',
  neutral: 'neutral',
}

export function buildVRM0Data(params: {
  humanoidMapping: HumanoidMappingTable
  metadata: VRMMetadata
  expressions: Record<string, ExpressionMapping>
  morphTargets: MorphTargetInfo[]
  springBoneChains: SpringBoneChainConfig[]
  allBones: BoneCandidate[]
}): VRM0BuildResult {
  const { humanoidMapping, metadata, expressions, morphTargets, springBoneChains, allBones } = params

  const humanBoneNodes: Partial<Record<string, THREE.Object3D>> = {}
  for (const mapping of Object.values(humanoidMapping)) {
    if (mapping.node) humanBoneNodes[mapping.boneName] = mapping.node
  }

  const allowedUserName = metadata.allowAvatarUsage === 'onlyAuthor' ? 'OnlyAuthor' : metadata.allowAvatarUsage === 'onlySeparatelyLicensedPerson' ? 'ExplicitlyLicensedPerson' : 'Everyone'

  const meta: Record<string, unknown> = {
    title: metadata.title || 'AI Auto VRM Avatar',
    version: metadata.version || undefined,
    author: metadata.author || 'Unknown',
    contactInformation: metadata.contactInformation || undefined,
    reference: metadata.reference || undefined,
    allowedUserName,
    // VRM0's license field is a fixed enum of specific license types (CC0, CC_BY, ...), not a
    // free-form URL - since we don't ask the user to pick one of those specific licenses,
    // 'Other' + the URL they entered is the only choice that doesn't misrepresent the terms.
    licenseName: 'Other',
    otherLicenseUrl: metadata.licenseUrl || undefined,
    violentUssageName: 'Disallow',
    sexualUssageName: 'Disallow',
    commercialUssageName: 'Disallow',
  }

  const morphByName = new Map<string, MorphTargetInfo>()
  for (const m of morphTargets) morphByName.set(m.name, m)

  const expressionData: Vrm0ExpressionData[] = []
  for (const exp of Object.values(expressions)) {
    if (!exp.morphTargetName) continue
    const target = morphByName.get(exp.morphTargetName)
    if (!target) continue
    const presetName = VRM1_TO_VRM0_PRESET[exp.preset] ?? 'unknown'
    expressionData.push({
      presetName,
      name: exp.preset,
      morphTargetBinds: [{ mesh: target.mesh, index: target.index, weight: 100 }],
    })
  }

  const boneNodeByName = new Map<string, THREE.Object3D>()
  for (const b of allBones) boneNodeByName.set(b.name, b.node)

  const springs: Vrm0SpringData[] = springBoneChains
    .map((chain) => {
      const rootNode = boneNodeByName.get(chain.rootBoneName)
      const joint = chain.joints[0]
      if (!rootNode || !joint) return null
      const spring: Vrm0SpringData = {
        name: chain.name,
        stiffness: joint.stiffness,
        gravityPower: joint.gravityPower,
        dragForce: joint.dragForce,
        hitRadius: joint.hitRadius,
        rootNode,
      }
      return spring
    })
    .filter((s): s is Vrm0SpringData => s !== null)

  return {
    meta,
    humanBoneNodes,
    headNode: humanBoneNodes.head ?? null,
    expressions: expressionData,
    springs,
  }
}
